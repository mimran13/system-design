# Patterns

Reusable solutions to recurring distributed systems problems. Understanding these lets you compose complex systems from well-understood building blocks.

| Topic | One-liner |
|---|---|
| [Rate Limiting](rate-limiting.md) | Token bucket, leaky bucket, sliding window — and where to enforce |
| [Circuit Breaker](circuit-breaker.md) | Fail fast to prevent cascade failures |
| [Saga Pattern](saga-pattern.md) | Distributed transactions without 2PC |
| [CQRS](cqrs.md) | Separate read and write models for scale and clarity |
| [Event Sourcing](event-sourcing.md) | Store events, not state — audit log as the source of truth |
| [Consistent Hashing](consistent-hashing.md) | Distribute load with minimal reshuffling on node changes |
| [Sharding](sharding.md) | Horizontal partitioning strategies and their tradeoffs |
| [Replication](replication.md) | Leader-follower, multi-leader, leaderless |
| [Read Replicas](read-replicas.md) | Scaling reads horizontally, replication lag, read-after-write |
| [Connection Pooling](connection-pooling.md) | PgBouncer, pool sizing, exhaustion prevention |
| [Outbox Pattern](outbox.md) | Reliable event publishing with transactional outbox |
| [Bulkhead](bulkhead.md) | Isolate failures to prevent cascade |
| [Retry & Timeout](retry-timeout.md) | Handling transient failures safely |
| [Idempotency](idempotency.md) | Safe retries — designing operations that can run multiple times |
| [Backoff Strategies](backoff.md) | Exponential backoff, jitter, avoiding thundering herd |
