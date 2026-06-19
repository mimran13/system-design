# Patterns

Reusable solutions to recurring distributed systems problems. Unlike algorithms or data structures, these patterns address the messy realities of networked systems: partial failures, retries, consistency, and scale. Understanding them lets you compose complex systems from well-understood building blocks — and communicate design decisions with precision.

These split into two families, reflected in the navigation:

- **Resilience patterns** — keeping a system *up* under failure and load: rate limiting, circuit breaker, retry/timeout, backoff, bulkhead, idempotency, saga, outbox, durable workflows.
- **Data & scaling patterns** — making *data* scale and stay correct: CQRS, event sourcing, consistent hashing, sharding (and its tooling), replication, read replicas, connection pooling.

---

## Suggested reading order

New to this topic? Read these in order — each builds on the previous:

1. [Rate Limiting](rate-limiting.md) — the first line of defense; introduces protecting services under load
2. [Retry & Timeout](retry-timeout.md) — how to handle transient failures without making them worse
3. [Circuit Breaker](circuit-breaker.md) — builds on retries: when to stop retrying and fail fast
4. [Idempotency](idempotency.md) — retries create duplicates; this makes them safe
5. [Sharding](sharding.md) — the core scale pattern: splitting data across nodes
6. [Replication](replication.md) — sharding's complement: copying data for durability and read scale

**Then, as needed (reference):** [Backoff Strategies](backoff.md), [Bulkhead](bulkhead.md), [Connection Pooling](connection-pooling.md), [Read Replicas](read-replicas.md), [Sharding Best Practices](sharding-best-practices.md), [Querying Sharded Data](querying-sharded-data.md), [Boring Tech](boring-tech.md)

**Advanced — come back later:** [Saga Pattern](saga-pattern.md), [Outbox Pattern](outbox.md), [CQRS](cqrs.md), [Event Sourcing](event-sourcing.md), [Consistent Hashing](consistent-hashing.md), [Sharding Tooling](sharding-tooling.md), [Unhappy-Path Engineering](unhappy-path-engineering.md), [Durable Workflows](durable-workflows.md)

---

## Pattern categories

```
Reliability patterns              Data patterns
  ├── Rate Limiting                 ├── CQRS
  ├── Circuit Breaker               ├── Event Sourcing
  ├── Retry & Timeout               ├── Outbox Pattern
  ├── Backoff Strategies            └── Idempotency
  └── Bulkhead

Scale patterns                    Consistency patterns
  ├── Consistent Hashing            ├── Saga Pattern
  ├── Sharding                      ├── Replication
  ├── Read Replicas                 └── Connection Pooling
  └── (Caching — see Caching section)
```

---

## Topics in this section

| Topic | What it covers | When it matters |
|---|---|---|
| [Rate Limiting](rate-limiting.md) | Token bucket, leaky bucket, sliding window — and where to enforce | Public APIs, protecting downstream services |
| [Circuit Breaker](circuit-breaker.md) | Fail fast to prevent cascade failures, half-open probe | Any service that calls an unreliable downstream |
| [Retry & Timeout](retry-timeout.md) | When to retry, timeout budgets, distinguishing transient from permanent | Any I/O-bound operation |
| [Backoff Strategies](backoff.md) | Exponential backoff, jitter, avoiding thundering herd | Retries at scale — essential with rate limits |
| [Bulkhead](bulkhead.md) | Thread pool / semaphore isolation to contain failures | Microservices calling multiple downstreams |
| [Idempotency](idempotency.md) | Safe retries — designing operations that can run multiple times | Payments, order processing, any POST with retry |
| [Saga Pattern](saga-pattern.md) | Distributed transactions without 2PC via compensating actions | Spanning transactions across multiple services |
| [Outbox Pattern](outbox.md) | Reliable event publishing atomic with state change | Guaranteeing exactly-one event per DB write |
| [CQRS](cqrs.md) | Separate read and write models for scale and clarity | Read-heavy systems, different consistency needs |
| [Event Sourcing](event-sourcing.md) | Store events, not state — audit log as the source of truth | Audit requirements, temporal queries, CQRS complement |
| [Consistent Hashing](consistent-hashing.md) | Distribute load with minimal reshuffling on node changes | Distributed caches, sharded systems |
| [Sharding](sharding.md) | Horizontal partitioning strategies and their tradeoffs | Databases too large for one node |
| [Replication](replication.md) | Leader-follower, multi-leader, leaderless — tradeoffs | Durability, high availability, read scaling |
| [Read Replicas](read-replicas.md) | Scaling reads horizontally, replication lag, read-after-write | Read-heavy workloads, analytics offloading |
| [Connection Pooling](connection-pooling.md) | PgBouncer, pool sizing, exhaustion prevention | Any app that talks to a database |

---

## Reliability patterns: how they compose

```
Request arrives
  │
  ├─ [Rate Limiter]      → reject if over limit (before spending resources)
  │
  ├─ [Circuit Breaker]   → fail fast if downstream is degraded
  │    ├── CLOSED  → pass through, count failures
  │    ├── OPEN    → fail immediately, no downstream calls
  │    └── HALF-OPEN → probe with one request, re-close if OK
  │
  ├─ [Bulkhead]          → separate thread pool per downstream
  │                        → one slow dependency can't block all workers
  │
  └─ [Retry + Backoff]   → retry transient failures
       ├── Exponential backoff: 1s, 2s, 4s, 8s...
       └── Jitter: randomize to avoid synchronized thundering herd
```

---

## Data consistency patterns: how they compose

```
User places order (write)
  │
  ├─ [CQRS]        → write model (command) updates the aggregate
  │                   read model (query) updated asynchronously
  │
  ├─ [Event Sourcing] → instead of UPDATE orders SET status='paid'
  │                     append OrderPaid event to event log
  │                     → derive current state by replaying events
  │
  └─ [Outbox]      → write + publish atomically
       ┌──────────────────────────────────────────┐
       │ BEGIN TRANSACTION                         │
       │   UPDATE orders SET status='paid'         │
       │   INSERT INTO outbox (event='OrderPaid')  │
       │ COMMIT                                    │
       └──────────────────────────────────────────┘
       Outbox relay: SELECT unpublished → publish to Kafka

Multi-service write (Saga)
  OrderService → PaymentService → InventoryService → ShippingService
  Each step: local transaction + event
  On failure: compensating transactions in reverse
  → Eventual consistency without distributed 2PC
```

---

## Interview shortlist

| Question | Key answer |
|---|---|
| *"How do you prevent a slow dependency from taking down your service?"* | Circuit breaker (fail fast after threshold) + bulkhead (isolated thread pool). |
| *"How do you handle distributed transactions across services?"* | Saga pattern: choreography (events) or orchestration (saga orchestrator). Each step is local + compensating action on failure. |
| *"CQRS — why split reads and writes?"* | Writes need consistency + constraints. Reads need performance + flexibility. Separate models let each optimize independently. Common in event-sourced systems. |
| *"What's the Outbox Pattern and why is it needed?"* | Atomically writing state AND publishing an event is impossible without it (two separate systems). Outbox: write event to the same DB in same transaction, relay publishes separately. |
| *"How does consistent hashing minimize reshuffling?"* | Keys and nodes on a ring. Adding a node only moves keys from its successor. vs modulo hashing: every key potentially remaps. |

---

## Related topics

- [Distributed Systems](../distributed/index.md) — the theory behind these patterns
- [Architecture: Event-Driven Architecture](../architecture/event-driven.md) — system-level view
- [Caching](../caching/index.md) — the most impactful performance pattern
- [Case Studies](../case-studies/index.md) — see these patterns applied to real systems
