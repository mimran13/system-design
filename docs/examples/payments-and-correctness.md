# Payments & Correctness — Practical Examples

Scenarios where correctness is non-negotiable: financial flows, idempotent APIs, multi-step workflows, audit trails. The common thread: **every operation must produce the right outcome exactly once, even with retries, failures, and partial completions**.

---

## Scenario 1: Charge a customer's card without ever double-charging

**Concrete situation**: E-commerce checkout. User clicks "Pay $99". Network is unreliable; mobile retries. The payment must charge exactly once even if the user clicks twice or the network drops mid-request.

### Reasoning

- **HTTP retries are unavoidable** — clients legitimately retry on transient errors.
- **The server can't tell** "is this a retry of a successful charge, or a fresh charge?" without help.
- **The answer is an idempotency key**: the client generates a unique key per payment intent; server stores it; subsequent requests with same key return the original result.
- **State machine** for payments: `pending → succeeded | failed`. Once in a terminal state, no further charges.
- **External call to Stripe / payment processor** has its own idempotency story — must use *its* idempotency keys too.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Idempotency](../patterns/idempotency.md) | The core pattern; idempotency keys per request |
| [Outbox Pattern](../patterns/outbox.md) | Charge state + downstream events must be atomic |
| [Database Transactions](../fundamentals/isolation-levels.md) | Insert idempotency record + create charge in one transaction |
| [Retry & Timeout](../patterns/retry-timeout.md) | Caller may retry; server handles safely |
| [Saga Pattern](../patterns/saga-pattern.md) | If charge succeeds but order creation fails — compensating action |

### Sketch

```
Client generates idempotency_key = uuid() before clicking "Pay"

POST /checkout/charge
  Headers: Idempotency-Key: abc-123
  Body: { amount: 9900, customer_id }

Server:
  1. INSERT INTO idempotency_keys (key='abc-123', status='processing')
       ON CONFLICT (key) DO NOTHING RETURNING *
     IF no row returned: another request is in flight → return existing record's result
  2. Call Stripe with idempotency key 'abc-123' (Stripe also dedupes)
  3. Receive Stripe response
  4. UPDATE idempotency_keys SET status='succeeded', response=... WHERE key='abc-123'
  5. Return response

Retry semantics:
  - Same Idempotency-Key → returns cached response from step 4
  - Different Idempotency-Key → fresh charge (caller's choice)
```

### Trade-offs

- **What you gain**: guarantees "exactly one charge per logical intent"; safe to retry; works across client/server/processor failures
- **What you give up**: complexity (extra table, dual idempotency layers); 24-hour key TTL means very late retries get fresh charge
- **Cost**: small DB overhead; small dev overhead

### Anti-patterns to avoid

- ❌ Disabling the "Pay" button after click in JS only → still vulnerable to network retry / refresh
- ❌ Using request ID as idempotency key → server-generated; defeats purpose (must be client-generated *before* request)
- ❌ Calling Stripe without an idempotency key → Stripe will dedupe at most for some operations; not all
- ❌ Using auto-increment ID as idempotency key → not unique across clients
- ❌ "We'll just check if charge exists for this user in last minute" → race conditions, false positives

### Variations

- **Two-phase**: PaymentIntent.create → confirm. The `id` of the intent serves as the idempotency anchor.
- **Multiple currencies / split payments**: each split has its own idempotency key
- **Webhook ack from Stripe**: webhook processing must be idempotent too (Stripe retries failed webhooks)

---

## Scenario 2: Multi-step order workflow — payment, inventory, fulfilment

**Concrete situation**: Order placement involves: (1) reserve inventory, (2) charge payment, (3) create fulfilment job, (4) send email. Each step is a separate service. If step 3 fails, you've charged but won't ship — bad. If step 1 fails, abort. If step 4 fails, retry but don't undo earlier steps.

### Reasoning

- **Distributed transaction across services is impractical** (no 2PC across HTTP services).
- **Sagas** are the answer: each step is a local transaction, with a compensating action if it fails.
- **Choreography vs orchestration** — for 3-4 steps with explicit error paths, orchestration is clearer.
- **Compensating actions are not always perfect inverses** (you can't "uncharge" a card; you issue a refund — different op).
- **State machine** + persistence per workflow run is essential for visibility.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Saga Pattern](../patterns/saga-pattern.md) | Multi-step distributed transaction with compensating actions |
| [Choreography vs Orchestration](../architecture/choreography-vs-orchestration.md) | Pick orchestration for explicit error paths |
| [Idempotency](../patterns/idempotency.md) | Each step must be idempotent for safe retries |
| [Event-Driven Architecture](../architecture/event-driven.md) | Events between services |
| [Workflow engines](../architecture/choreography-vs-orchestration.md) | Temporal, Step Functions handle persistence + retries |

### Sketch

```
Workflow engine (Temporal / Step Functions / custom orchestrator):

State machine:
  start → reserve_inventory → charge_payment → create_fulfilment → send_email → done

If reserve_inventory fails:
  → end (abort, return error)
If charge_payment fails:
  → release_inventory → end (compensate step 1)
If create_fulfilment fails:
  → refund_payment → release_inventory → end (compensate steps 1, 2)
If send_email fails:
  → retry email (5 times, exponential backoff)
  → if still fails: log warning; don't undo (email failure is recoverable separately)
```

### Trade-offs

- **What you gain**: explicit, observable workflow; compensating actions ensure consistency; long-running tolerated (workflow engine persists state)
- **What you give up**: complexity (workflow engine to operate); eventual consistency (saga in-flight = inconsistent state)
- **Cost**: managed Temporal Cloud, Step Functions, or self-host Temporal (~$500-2K/month for small product)

### Anti-patterns to avoid

- ❌ Trying to do this in one DB transaction across services → 2PC, fragile, slow
- ❌ Implementing compensations as DB row deletes / updates → lose audit trail; refunds aren't deletes
- ❌ Choreography for a 4-step workflow with explicit error paths → impossible to debug
- ❌ Skipping idempotency on individual steps → retry doubles work
- ❌ Storing workflow state only in memory → server restart loses in-flight workflows

### Variations

- **Saga with parallel steps**: charge payment AND reserve inventory simultaneously; await both
- **Human approval step**: workflow waits hours/days; engine must persist state across that
- **Compensation chains**: cascading rollback through 5+ steps

---

## Scenario 3: Refund flow with audit trail

**Concrete situation**: Customer requests refund. System needs to (a) refund the card, (b) credit any loyalty points back, (c) update order status, (d) record everything for tax/compliance audit (7 years).

### Reasoning

- **Audit requirement** drives architecture: every state change needs to be recorded with who, when, why.
- **Event sourcing** fits naturally — events ARE the audit log.
- **State changes must be idempotent** — refund can be retried safely.
- **Different downstream systems** must learn about refund (loyalty, accounting, customer).

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Event Sourcing](../patterns/event-sourcing.md) | Every refund event is the audit |
| [CQRS](../patterns/cqrs.md) | Different views: customer dashboard, accounting export, support tooling |
| [Outbox Pattern](../patterns/outbox.md) | Refund DB write + downstream events atomic |
| [Idempotency](../patterns/idempotency.md) | Retry-safe refund operation |
| [Saga Pattern](../patterns/saga-pattern.md) | Multi-step: refund, credit, status, notify |

### Sketch

```
POST /refunds { order_id, amount, reason }
       │
       ▼
Refund command:
  1. INSERT event RefundRequested { order_id, amount, reason, request_id }
  2. (within transaction) INSERT into outbox
  3. Outbox publisher → Kafka topic refund.events

Consumers:
  - PaymentService: consume RefundRequested → call Stripe refund → emit RefundProcessed | RefundFailed
  - LoyaltyService: consume RefundProcessed → emit LoyaltyCreditAdjusted
  - OrderService: consume RefundProcessed → emit OrderStatusChanged (refunded)
  - NotificationService: consume RefundProcessed → send email
  - AnalyticsService: consume all events → write to warehouse

Audit / view rebuilding:
  Replay all RefundRequested events → derive current state of any refund
  Auditor wants 2024-Q1 refunds → query warehouse (built from events)
```

### Trade-offs

- **What you gain**: full audit trail "for free" (events ARE the truth); easy to add new consumers; rebuild any view from history
- **What you give up**: eventual consistency (downstream lags); event schema versioning is real work; complexity of event-sourced systems
- **Cost**: Kafka cluster + event store; team learning curve

### Anti-patterns to avoid

- ❌ Direct DB writes from each consumer service → no audit trail; tight coupling
- ❌ Storing audit log as logs only → can't reconstruct state, only flat history
- ❌ Soft-deleting / overwriting refund records → defeats audit
- ❌ Skipping idempotency keys on refund processor → retry causes double-refund (rare, but disastrous)

---

## Scenario 4: Detect fraudulent transactions in real time

**Concrete situation**: Payments platform processing 10K transactions/sec needs to flag suspicious ones (unusual location, velocity, amount) within 200ms of submission. False positives cost user trust; false negatives cost real money.

### Reasoning

- **200ms budget** rules out heavy ML models in the critical path (typically).
- **Rule-based + simple ML inference** runs in time; complex models async.
- **Stateful**: "5 transactions in 1 minute from this user" needs sliding window state.
- **Two-tier**: fast rules synchronously block obvious fraud; complex async analysis flags later.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Stream processing](../messaging/event-streaming.md) | Stateful sliding-window rules |
| [Rate Limiting](../patterns/rate-limiting.md) | Velocity rules: max N tx per user per minute |
| [Distributed cache](../caching/distributed-caching.md) | Recent user behaviour in Redis with TTL |
| [Circuit Breaker](../patterns/circuit-breaker.md) | If fraud service slow, fail-open or fail-closed (policy decision) |
| [Async / Lambda architecture](../architecture/lambda-kappa-architectures.md) | Fast rules + async deep analysis |

### Sketch

```
Transaction arrives (200ms budget):

Sync path:
  POST /transaction
    │
    ▼
  Fraud service:
    - Read last-N tx from Redis (user_id key, list of recent tx)
    - Run rules: velocity, geographic anomaly, amount threshold
    - Score 0-100 → if > 80, REJECT
    - Update Redis with this tx (sliding window)
  Total: ~30ms

  If rules pass:
    Approve transaction; publish to Kafka

Async path (background analysis):
  Kafka topic transactions consumed by:
    - ML inference service (deeper model, 1-10s OK)
    - If suspicious: emit FraudFlagged event
    - Customer support queue gets FraudFlagged events for review
    - Subsequent tx from same user in next 24h get higher scrutiny
```

### Trade-offs

- **What you gain**: sub-200ms decisions on obvious fraud; deeper analysis without blocking transactions; flexible policy
- **What you give up**: false negatives (sophisticated fraud passes rule check); requires good feature engineering for rules
- **Cost**: Redis cluster (latency-sensitive), stream processor, ML pipeline — ~$5-10K/month

### Anti-patterns to avoid

- ❌ Blocking on async ML model in 200ms budget → tail latency disaster
- ❌ Rules service that calls Postgres for every check → DB becomes bottleneck
- ❌ No async deep analysis → easy to bypass rules
- ❌ Hard fail when fraud service down → no transactions can happen; usually fail-open is acceptable here (depending on risk tolerance)

---

## Common pitfalls across payments scenarios

| Pitfall | Mitigation |
|---|---|
| Double-charge on retry | Idempotency keys, client-generated, before first send |
| Refund processed twice | Refund itself idempotent; tracked by request_id |
| Charge succeeded but DB says it didn't | Outbox pattern; transactionally write both states |
| Saga left half-completed | Workflow engine with persistent state + retry |
| Missing audit data after compliance request | Event sourcing or comprehensive audit log from day one |
| Customer charged but not notified | Idempotent email with retry; webhook ack from email provider |
| Race condition between simultaneous charges | DB row lock (`SELECT FOR UPDATE`) or optimistic concurrency |

---

## Related

- [Idempotency](../patterns/idempotency.md)
- [Saga Pattern](../patterns/saga-pattern.md)
- [Outbox Pattern](../patterns/outbox.md)
- [Event Sourcing](../patterns/event-sourcing.md)
- [Choreography vs Orchestration](../architecture/choreography-vs-orchestration.md)
- [Database Transactions & Isolation](../fundamentals/isolation-levels.md)
