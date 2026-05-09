# Exactly-Once Semantics

When a distributed system sends a message or processes an operation, three delivery guarantees are possible. Choosing the wrong one — or not thinking about it at all — leads to duplicate payments, lost orders, or corrupted counts.

---

## The three delivery guarantees

### At-most-once

Send the message once. Don't retry. If it's lost, it's lost.

```
Producer → [network might drop it] → Consumer

On failure: do nothing
Result: message may be processed 0 or 1 times
```

**Where it's acceptable:**
- Metrics and analytics (losing a few data points is fine)
- Log events where approximate counts are OK
- Notifications where duplication is worse than loss (don't send "your order shipped" twice)

**Cost:** Lowest — no deduplication, no retry logic, no state.

### At-least-once

Retry until you get an acknowledgment. Accept that the consumer might process it multiple times.

```
Producer → Consumer → no ACK (network failure)
Producer → Consumer → no ACK (timeout)
Producer → Consumer → ACK ✓

Consumer may have processed 1, 2, or 3 times
```

**Where it's the default:**
- Kafka consumers (re-read from offset on failure)
- SQS standard queues (may deliver more than once)
- Most HTTP retry logic

**Cost:** Requires idempotent consumers — the same message must be safe to process multiple times.

### Exactly-once

Each message is processed exactly once, regardless of failures and retries.

```
Producer → Consumer
  - Even if retried, only processed once
  - Even if consumer crashes mid-processing, processed exactly once on recovery
```

**True exactly-once is very expensive and often unnecessary.** Most systems that claim exactly-once actually implement "effectively once" — at-least-once delivery + idempotent consumers = same end result.

**Cost:** Highest — requires distributed coordination or idempotency infrastructure.

---

## Why exactly-once is hard

The fundamental challenge: you can't distinguish between "this message was never processed" and "this message was processed but I didn't get the ACK."

```
Scenario:
  Consumer receives message
  Consumer processes it (charges the payment)
  Consumer crashes before sending ACK
  
  Producer retries: was it processed or not?
  
  If retry → process again → double charge
  If no retry → lost operation
  
  The consumer cannot know what state it was in before crash
  without some external state store
```

---

## Achieving exactly-once: the patterns

### Pattern 1: Idempotent operations (simplest)

Design operations so that repeating them has no additional effect. The consumer is safe to call multiple times.

```python
# NOT idempotent — running twice doubles the balance
def add_reward_points(user_id: str, points: int):
    db.execute("UPDATE users SET points = points + ? WHERE id = ?", points, user_id)

# Idempotent — running twice gives same result
def add_reward_points(user_id: str, points: int, event_id: str):
    db.execute("""
        INSERT INTO reward_events (event_id, user_id, points)
        VALUES (?, ?, ?)
        ON CONFLICT (event_id) DO NOTHING
    """, event_id, user_id, points)
    
    db.execute("""
        UPDATE users SET points = (
            SELECT SUM(points) FROM reward_events WHERE user_id = ?
        ) WHERE id = ?
    """, user_id, user_id)
```

**When it works:** Operations that are naturally idempotent (set a value, upsert a record, PUT in REST).

### Pattern 2: Deduplication key (most practical)

Track which messages you've already processed. Reject duplicates.

```python
# Consumer with deduplication
def process_payment(payment_event: dict) -> bool:
    payment_id = payment_event["payment_id"]
    
    # Check if already processed
    if db.exists("SELECT 1 FROM processed_payments WHERE payment_id = ?", payment_id):
        logger.info(f"Duplicate payment event {payment_id}, skipping")
        return True  # already done — safe to ACK
    
    # Process in a transaction: charge + mark as processed
    with db.transaction():
        charge_card(
            card_token=payment_event["card_token"],
            amount=payment_event["amount"]
        )
        db.execute(
            "INSERT INTO processed_payments (payment_id, processed_at) VALUES (?, ?)",
            payment_id, datetime.utcnow()
        )
    
    return True
```

**Key design:** The "check + mark processed" must be atomic (in the same DB transaction as the action). Otherwise a crash between the action and the mark causes the race.

### Pattern 3: Outbox pattern (for event publishing)

Guarantee that exactly one event is published per database state change.

```python
# The outbox pattern makes event publishing atomic with the state change
def confirm_order(order_id: str):
    with db.transaction():
        # State change
        db.execute("UPDATE orders SET status='confirmed' WHERE id=?", order_id)
        
        # Event record (same transaction — atomic)
        db.execute("""
            INSERT INTO outbox (event_id, event_type, payload, published)
            VALUES (?, 'OrderConfirmed', ?, false)
        """, uuid4(), json.dumps({"order_id": order_id}))
    
    # Outbox relay runs separately:
    # SELECT * FROM outbox WHERE published=false
    # → publish to Kafka
    # → UPDATE outbox SET published=true WHERE event_id=?
```

Even if the relay crashes, it restarts and re-reads unpublished events. Consumers handle duplicates via dedup key. See [Outbox Pattern](../patterns/outbox.md).

### Pattern 4: Kafka exactly-once (transactions)

Kafka's transactional API provides exactly-once semantics across produce + consume:

```python
from confluent_kafka import Producer, Consumer, KafkaException

# Producer with exactly-once
producer = Producer({
    "bootstrap.servers": "localhost:9092",
    "transactional.id": "payment-processor-1",   # unique per producer instance
    "enable.idempotence": True
})

producer.init_transactions()

def process_and_forward(input_record):
    try:
        producer.begin_transaction()
        
        # Process the record
        result = process_payment(input_record.value())
        
        # Produce output atomically with the commit
        producer.produce("payments-processed", value=json.dumps(result))
        
        # Commit the transaction AND the consumer offset atomically
        producer.send_offsets_to_transaction(
            {TopicPartition(input_record.topic(), input_record.partition()): 
             CommittedOffset(input_record.offset() + 1)},
            consumer.consumer_group_metadata()
        )
        producer.commit_transaction()
        
    except Exception as e:
        producer.abort_transaction()
        raise
```

**What Kafka's EOS guarantees:**
- Each message consumed exactly once (offset committed atomically with output)
- Each output message produced exactly once (idempotent producer)
- On crash: transaction aborted, offset reset, reprocess from last committed offset

**Cost:** ~20-30% throughput reduction vs at-least-once. Use for financial flows, not analytics.

---

## Comparison

| Guarantee | How to achieve | Cost | Use when |
|---|---|---|---|
| **At-most-once** | Don't retry | Minimal | Metrics, analytics, non-critical notifications |
| **At-least-once** | Retry + idempotent consumer | Low | Most messaging systems (default for Kafka) |
| **Effectively-once** | At-least-once + deduplication key | Medium | Payments, order processing, any stateful operation |
| **Exactly-once** | Kafka transactions / 2PC | High | Strict compliance, financial audit trails |

---

## Deduplication window

Deduplication state can't be stored forever. Choose a window:

```python
# Time-based deduplication window
def process_event(event_id: str, payload: dict) -> bool:
    # Only check for duplicates in the last 7 days
    # Events older than 7 days assumed to not be retries
    
    exists = db.execute("""
        SELECT 1 FROM processed_events 
        WHERE event_id = ? 
          AND processed_at > NOW() - INTERVAL '7 days'
    """, event_id).fetchone()
    
    if exists:
        return True  # duplicate within window, skip
    
    # Process and record
    with db.transaction():
        execute_action(payload)
        db.execute(
            "INSERT INTO processed_events (event_id, processed_at) VALUES (?, NOW())",
            event_id
        )
    return True

# Clean up old dedup records (run periodically)
db.execute("DELETE FROM processed_events WHERE processed_at < NOW() - INTERVAL '8 days'")
```

**Window size trade-off:**
- Too short: retries after the window get reprocessed
- Too long: large dedup table, slower lookups
- Common windows: 24 hours (for intraday retries), 7 days (for weekly jobs), 30 days (for monthly billing)

---

## Exactly-once in practice: what really ships

Real production systems typically use:

```
Payment processing:
  At-least-once delivery (Kafka consumer) 
  + Idempotency key on payment provider API
  + Deduplication table in payments DB
  = Effectively-once (same outcome as exactly-once)

Order processing:
  At-least-once delivery
  + Outbox pattern (atomic state change + event)
  + Idempotent order confirmation (check order status before processing)
  = Effectively-once

Analytics / metrics:
  At-most-once
  (Losing 0.1% of events is acceptable for dashboards)
```

True Kafka EOS transactions are used when:
- A downstream consumer isn't idempotent and can't easily be made so
- Regulatory/audit requirements mandate no duplicates at the infrastructure level

---

## Interview angle

!!! tip "Delivery semantics in system design"
    - *"How do you prevent duplicate payments in a distributed system?"* → Idempotency key sent with the payment request. Payment processor stores processed keys with a TTL. Retry with same key → returns original response, doesn't charge again.
    - *"Your Kafka consumer crashes mid-processing. What happens?"* → Depends on when the offset was committed. If before processing: message reprocessed (at-least-once) → need idempotent consumer. If after: message lost (at-most-once). For payments: commit offset only after successful processing + recording the event ID in a dedup table.
    - *"What's the difference between at-least-once and exactly-once?"* → At-least-once: message processed ≥1 times, consumer must be idempotent. Exactly-once: message processed =1 time, requires coordination. In practice, exactly-once = at-least-once + deduplication, giving the same outcome more cheaply.

## Related topics

- [Patterns: Idempotency](../patterns/idempotency.md) — designing idempotent operations
- [Patterns: Outbox Pattern](../patterns/outbox.md) — atomic event publishing
- [Messaging: Kafka](../messaging/kafka.md) — Kafka's transactional API in depth
- [Distributed Locks](distributed-locks.md) — coordination for exactly-once execution
- [Fault Tolerance](../fundamentals/fault-tolerance.md) — the broader reliability context
