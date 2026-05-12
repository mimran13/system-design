# Idempotency

## What it is

An operation is idempotent if performing it multiple times produces the same result as performing it once. In distributed systems, idempotency is fundamental — networks fail, clients retry, queues deliver at-least-once.

```
HTTP GET: always idempotent (reading doesn't change state)
HTTP PUT: idempotent (setting the same value twice = same as once)
HTTP DELETE: idempotent (deleting twice = same end state)
HTTP POST: NOT idempotent by default (two POST requests = two created records)
```

## You'll see this when...

- Stripe / payment APIs require an `Idempotency-Key` header (this is why)
- Webhook delivered twice → same operation applied twice (double-charge!)
- Kafka / SQS at-least-once delivery → consumer processes a message twice
- Retry on a "did it succeed?" call — caller can't tell, retries safely
- Mobile apps with flaky networks need to re-send confirmations
- "Customer was charged twice" appears in support tickets
- Distributed system docs say "ensure consumers are idempotent"
- Postgres `ON CONFLICT DO NOTHING` or `MERGE` statements

## Why it matters

```
Client → POST /orders → network timeout
Client doesn't know: did the order get created?

Without idempotency:
  Client retries → two orders created
  Customer charged twice

With idempotency:
  Client retries with same idempotency key
  Server detects duplicate → returns original response
  Customer charged once
```

## Idempotency key pattern

Client generates a unique key per request (UUID) and includes it as a header:

```http
POST /payments
Idempotency-Key: 7f9e4321-1234-4abc-8def-9876543210ab
Content-Type: application/json

{ "amount": 100, "currency": "USD", "to": "user_456" }
```

Server logic:
```python
def create_payment(idempotency_key: str, amount: Decimal, to: str):
    # Check if we've seen this key before
    existing = idempotency_store.get(idempotency_key)
    if existing:
        if existing['status'] == 'processing':
            # Still in flight — wait or return 202
            raise PaymentStillProcessingError()
        # Completed — return same response
        return existing['response']
    
    # Mark as in-progress (with TTL)
    idempotency_store.set(idempotency_key, {'status': 'processing'}, ttl=300)
    
    try:
        result = payment_service.charge(amount, to)
        response = {'payment_id': result.id, 'status': 'completed'}
        
        # Store result for future duplicates
        idempotency_store.set(idempotency_key, {
            'status': 'completed',
            'response': response
        }, ttl=86400)  # keep for 24 hours
        
        return response
    
    except Exception as e:
        idempotency_store.set(idempotency_key, {
            'status': 'failed',
            'error': str(e)
        }, ttl=86400)
        raise
```

**Redis as idempotency store:**
```python
# Atomic check-and-set using SET NX (only set if key doesn't exist)
result = redis.set(
    f"idem:{idempotency_key}",
    json.dumps({"status": "processing"}),
    nx=True,    # only set if not exists
    ex=300      # 5 minute TTL
)

if not result:
    # Key already exists — duplicate request
    existing = json.loads(redis.get(f"idem:{idempotency_key}"))
    return existing['response']
```

## Database-level idempotency

### Unique constraint

```sql
-- Prevent duplicate payments by idempotency_key
CREATE TABLE payments (
    id               UUID PRIMARY KEY,
    idempotency_key  TEXT UNIQUE NOT NULL,
    amount           DECIMAL,
    status           TEXT
);

-- Duplicate insert raises UniqueViolation → safe to catch and return original
INSERT INTO payments (id, idempotency_key, amount)
VALUES (gen_random_uuid(), 'key-123', 100)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING *;
```

### Natural idempotency

Design operations to be inherently idempotent without a key:

```sql
-- Idempotent: set absolute value (not increment)
UPDATE accounts SET balance = 250 WHERE id = 123;
-- Running twice: same result

-- NOT idempotent: relative change
UPDATE accounts SET balance = balance - 100 WHERE id = 123;
-- Running twice: balance reduced by 200 (wrong!)

-- Make relative change idempotent with condition
UPDATE accounts SET balance = balance - 100 
WHERE id = 123 AND balance >= 100 AND NOT EXISTS (
    SELECT 1 FROM processed_transactions WHERE tx_id = 'tx-abc'
);
INSERT INTO processed_transactions (tx_id) VALUES ('tx-abc') ON CONFLICT DO NOTHING;
```

## Event consumer idempotency

Kafka and SQS consumers receive messages at-least-once. Each consumer must handle duplicates:

```python
class OrderCreatedConsumer:
    def handle(self, event):
        # Check processed events table
        if self.db.exists("SELECT 1 FROM processed_events WHERE event_id = ?", [event.id]):
            logger.info(f"Duplicate event {event.id}, skipping")
            return
        
        # Process
        self.email_service.send_confirmation(event.user_id, event.order_id)
        
        # Mark as processed (atomically with the processing if possible)
        self.db.execute(
            "INSERT INTO processed_events (event_id, processed_at) VALUES (?, NOW())",
            [event.id]
        )
```

**Deduplication window:** Don't keep processed_events forever. Delete after a safe window:

```sql
-- Clean up events older than 7 days
DELETE FROM processed_events WHERE processed_at < NOW() - INTERVAL '7 days';
```

This means: if the same event arrives after 7 days, it will be reprocessed. Design for this to be acceptable (or extend the window).

## AWS SQS: content-based deduplication (FIFO)

FIFO queues support message deduplication within a 5-minute window:

```python
sqs.send_message(
    QueueUrl=fifo_queue_url,
    MessageBody=json.dumps(order),
    MessageGroupId='orders',
    MessageDeduplicationId=f"order-{order_id}"  # SHA-256 of content if not specified
)
```

Within 5 minutes: duplicate `MessageDeduplicationId` → message silently discarded.

## Stripe's idempotency model

Stripe is the canonical example. Every mutating API call can include an `Idempotency-Key`:

- If the same key is used within 24 hours → return the original response
- After 24 hours → treat as a new request
- Keys can be reused for different endpoints (scoped per endpoint)
- Concurrent requests with same key → one proceeds, others wait

## Idempotency in the saga pattern

Compensation in sagas must be idempotent too:

```python
def release_payment(order_id):
    # Check if already released
    reservation = db.get_payment_reservation(order_id)
    if not reservation or reservation.status == 'released':
        return  # already compensated
    
    payment_service.release(reservation.id)
    db.update_reservation_status(order_id, 'released')
```

## Interview angle

!!! tip "When to bring up idempotency"
    Any time there are retries, queues, distributed transactions, or payment/mutation operations.

**Strong answer pattern:**
1. State: "Any operation that can be retried must be idempotent"
2. For APIs: idempotency key pattern (client-generated UUID, stored in Redis/DB)
3. For queue consumers: processed events table with deduplication
4. For database operations: unique constraints, ON CONFLICT DO NOTHING
5. For sagas: every step and compensation must be idempotent

## Related topics

- [Retry & Timeout](retry-timeout.md) — retry requires idempotency
- [Saga Pattern](saga-pattern.md) — saga steps must be idempotent
- [Outbox Pattern](outbox.md) — at-least-once delivery needs idempotent consumers
- [Message Queues](../messaging/message-queues.md) — at-least-once delivery assumption
