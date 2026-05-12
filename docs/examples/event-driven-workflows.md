# Event-Driven Workflows — Practical Examples

Scenarios that combine events, CQRS, event sourcing, and sagas to solve real workflow problems. The common thread: **decoupled services communicate through events**, with the right concept depending on whether you need audit trails, multi-step coordination, or read scaling.

---

## Scenario 1: CQRS for a reporting workload that's killing the OLTP database

**Concrete situation**: SaaS product where the same Postgres handles transactional writes (orders, users) AND complex reports (joins across 6 tables, aggregates over months). Reports lock things up for transactional users; transactional load slows reports.

### Reasoning

- **One database, two competing workloads** — classic OLTP+OLAP conflict.
- **Read replicas help reads** but the queries are heavy; replicas still struggle.
- **CQRS** = separate the read model entirely. Write side stays Postgres (transactional integrity); read side becomes a denormalised store optimised for reports.
- **Eventual consistency** is acceptable for reports — "data as of 2 minutes ago" is fine for dashboards.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [CQRS](../patterns/cqrs.md) | Separate read and write models |
| [Outbox Pattern](../patterns/outbox.md) | Capture every write reliably |
| [Event Streaming (Kafka)](../messaging/event-streaming.md) | Bus between write and read sides |
| [Data Warehousing](../storage/data-warehousing.md) | Columnar store for reporting |
| [Read Replicas](../patterns/read-replicas.md) | Quick fix; CQRS is the proper one |

### Sketch

```
Before:
  App ─── Postgres (transactional + reports)
                ↓
            Slow reports lock everything

After (CQRS):

App writes ─► Postgres (commands, state)
                  │
                  └─► Outbox table (events)
                            │
                  Debezium ─┘
                            │
                            ▼
                          Kafka
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    Reporting consumer            Search consumer
              │                           │
              ▼                           ▼
        ClickHouse                  Elasticsearch
        (denormalised,              (search-shaped)
         reportable)
              │                           │
              └─── reads from ─────┬──────┘
                                    │
                              Reporting UI / Search

Read latency from write event to reportable: 1-30 seconds
```

### Trade-offs

- **What you gain**: OLTP fast; reports fast; each store optimised for its workload
- **What you give up**: data is eventually consistent (2 minutes lag possible); two stores to operate; reports may show "data as of 09:42:31" not "right now"
- **Cost**: ClickHouse on Aiven / managed ~$500-1500/month at small scale

### Anti-patterns to avoid

- ❌ Just adding read replicas → replicas don't help heavy aggregate queries fundamentally
- ❌ Materialized views in Postgres for reports → run on the same server competing for CPU
- ❌ Dual-writes from app to Postgres + ClickHouse → drift; one fails, other doesn't
- ❌ ETL job once a day → reports only fresh once a day; not what users want

---

## Scenario 2: Event sourcing for a financial ledger

**Concrete situation**: Building a wallet/balance system. Every credit and debit must be auditable for 7 years; "what was Bob's balance on March 15 at 3pm" must be answerable; bugs in past balance calculations must be reproducible.

### Reasoning

- **Storing only current balance loses history**. Any bug in update logic → wrong balance with no way to fix.
- **Event sourcing**: every transaction is an event. Balance = sum(events). Bug? Replay events through corrected logic.
- **Audit-by-design**: events ARE the audit log. No separate audit logging needed.
- **Snapshots** for performance: precompute balance at known points; replay events since the snapshot for current state.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Event Sourcing](../patterns/event-sourcing.md) | The core pattern |
| [CQRS](../patterns/cqrs.md) | Reads from a projected balance, not from events directly |
| [CQRS+ES as architecture](../architecture/cqrs-event-sourcing-architecture.md) | When ES is the primary architecture |
| [Outbox Pattern](../patterns/outbox.md) | Events + projections atomic |
| [Idempotency](../patterns/idempotency.md) | Each event has a unique ID; replay safely |

### Sketch

```
Write side (commands):
  POST /wallets/{id}/credit { amount, reason }
        │
        ▼
  Validate (sufficient permissions, etc.)
  APPEND event WalletCredited { wallet_id, amount, balance_after, ts, reason, request_id }
  to event store (EventStoreDB / Postgres append-only events table)

Snapshot every 1000 events:
  Compute current balance from events
  Store snapshot { wallet_id, balance, last_event_id, ts }

Read side (projections):
  Consumer of events updates Postgres "current_balances" table
  GET /wallets/{id}/balance → reads from current_balances (fast)

Audit query:
  GET /wallets/{id}/history?from=...&to=...
  → query events table by wallet_id + time range

Time-travel:
  GET /wallets/{id}/balance-at?date=2024-03-15
  → find latest snapshot before that date
  → replay events from snapshot to that date
  → return balance
```

### Trade-offs

- **What you gain**: complete audit trail; reproducible state; time travel; can rebuild any view by replaying
- **What you give up**: complexity (event versioning, projections, snapshots); GDPR challenges (events immutable; "right to be forgotten" needs crypto-shredding); learning curve
- **Cost**: more storage (events accumulate); ~$200-500/month for managed event store at modest scale

### Anti-patterns to avoid

- ❌ Storing only balance, no events → audit gaps; bugs unrecoverable
- ❌ Mutable events ("oh let me just edit this one event") → defeats the model
- ❌ Building projections inline in command handlers → tight coupling; can't add new views
- ❌ No snapshotting → loading wallet means replaying 1M events
- ❌ Event sourcing the whole product (UI state, sessions, etc.) → most things don't need it

---

## Scenario 3: Order fulfilment workflow with explicit human steps

**Concrete situation**: B2B order: customer places order → manual approval (sales rep within 1 business day) → fraud check (async, 2-30 min) → payment processing → fulfilment (warehouse picks, ships) → invoice → shipped notification. Each step can fail; each can take minutes to days. Visibility into "where is order #123" is critical.

### Reasoning

- **Choreography (events)** would scatter this workflow across N services with no central view.
- **Orchestration with workflow engine** makes the workflow explicit, observable, retryable, and supports long pauses (days for human approval).
- **Compensation** is needed when a step fails after earlier steps succeeded.
- **Saga pattern** with orchestration is the right shape.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Saga Pattern](../patterns/saga-pattern.md) | Multi-step distributed transaction |
| [Choreography vs Orchestration](../architecture/choreography-vs-orchestration.md) | Orchestration for complex workflows |
| [Workflow engines (Temporal, Step Functions)](../architecture/choreography-vs-orchestration.md) | Persistent state, retries, timers |
| [Event-Driven Architecture](../architecture/event-driven.md) | Events between workflow and services |
| [Idempotency](../patterns/idempotency.md) | Each step retry-safe |

### Sketch

```
Customer → POST /orders → Order Service:
  Create order in DB (status = pending_approval)
  Start workflow in Temporal: OrderFulfilmentWorkflow(order_id)

Workflow:
  Step 1: Wait for approval signal (up to 24h timeout)
            on timeout → cancel order
  Step 2: Run fraud check activity (async)
            timeout: 30 min
            on suspicious → notify support; pause workflow
  Step 3: Charge payment (idempotent, with retry+backoff)
            on failure → mark order failed; send notification
  Step 4: Reserve inventory (compensable: release on later failure)
  Step 5: Submit fulfilment job
            poll for status: shipped | failed
            on failure → refund payment, release inventory, notify
  Step 6: Generate invoice
  Step 7: Notify customer "shipped"

Visibility:
  GET /orders/{id}/status → reads workflow state from Temporal
  Engineering UI: see all running workflows; replay; force-step
```

### Trade-offs

- **What you gain**: explicit workflow; observable state; retries built-in; long-running OK; clean compensation paths
- **What you give up**: Temporal/Step Functions to operate; team needs to learn workflow engine
- **Cost**: Temporal Cloud ~$200-1000/month for small product

### Anti-patterns to avoid

- ❌ Implementing this as choreography with 7 services subscribing to events → no global view; debugging hell
- ❌ Holding workflow state in app memory → server restart loses state
- ❌ Running this as a Cron job that polls every 30s → not real-time; complex state machines hand-rolled
- ❌ Stateless event handling for steps that need long pauses → you'll reinvent a workflow engine badly

---

## Scenario 4: Real-time analytics derived from transactional events

**Concrete situation**: Marketplace with 100K transactions/sec. Real-time dashboards: "GMV in last hour", "items sold per category", "top sellers right now". Updates within 30 seconds.

### Reasoning

- **Reading from OLTP for analytics** doesn't scale.
- **Stream processing** of events directly: every transaction → emit event → aggregator updates rolling stats.
- **Multiple read models** for different views (per-category, per-seller, etc.) — CQRS.
- **Lambda or Kappa**: this fits Kappa well — pure stream, with replay for new metrics.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Event Streaming (Kafka)](../messaging/event-streaming.md) | The bus carrying transaction events |
| [Stream processing (Flink)](../messaging/event-streaming.md) | Stateful windowed aggregation |
| [Lambda / Kappa](../architecture/lambda-kappa-architectures.md) | Kappa fits here |
| [CQRS](../patterns/cqrs.md) | Each dashboard = its own read model |
| [Probabilistic Data Structures](../fundamentals/probabilistic-data-structures.md) | HLL for distinct counts at scale |

### Sketch

```
Transaction service ──► writes to Postgres (source of truth)
                       │
                       └─► Outbox event TransactionCompleted
                                  │
                       Debezium → Kafka topic transactions

Multiple Flink jobs consume the stream:
  
  Job: GMV per minute
    State: rolling 60-min sum per region
    Output: every 30s → Redis hash gmv:by_region:{minute}
  
  Job: Top sellers
    State: rolling 1-hour count per seller
    Top-K aggregation
    Output: every 30s → Redis sorted set top_sellers
  
  Job: Per-category trends
    State: rolling 1-hour count per category
    Output: → ClickHouse for historical drilldown

Dashboard:
  Reads from Redis (real-time numbers, sub-ms)
  Reads from ClickHouse (historical, sub-second)
  Refreshes every 30s

Replay (e.g., add a new metric):
  Spin up new Flink job consuming from offset 0
  Build the new aggregation
  Once caught up: switch dashboard to new state
```

### Trade-offs

- **What you gain**: dashboards always fresh; no impact on OLTP; new metrics added by deploying new job + replaying
- **What you give up**: complexity (stream infra), event-time vs processing-time semantics, schema evolution care
- **Cost**: Flink + Kafka + ClickHouse ~$5-20K/month for production scale

### Anti-patterns to avoid

- ❌ Querying Postgres directly for "GMV in last hour" every 30s → table-scan on big table
- ❌ Caching the dashboard query result for 30s in Redis → still hits OLTP every 30s
- ❌ Computing aggregations in app code with batch jobs every 5 min → not real-time
- ❌ Single global Flink state that grows unbounded → eventual OOM; use windowing, retention

---

## Common pitfalls across event-driven scenarios

| Pitfall | Mitigation |
|---|---|
| Event schema breaks consumers | Schema registry (Avro / Protobuf) with compatibility checks |
| Events arrive out of order | Event-time processing with watermarks; idempotent consumers |
| "We need exactly-once delivery" | Aim for at-least-once + idempotent consumers; Kafka transactions for end-to-end EOS |
| Producer succeeds, event publish fails | Outbox pattern; never dual-write |
| New consumer needs to start from beginning | Long retention on Kafka; or replay-able event store |
| Hard to debug "what happened to event X" | Distributed tracing across services + Kafka |
| Eventual consistency surprises users | Set expectations in UI ("balance updates within seconds") |

---

## Choosing between styles

| Situation | Likely fit |
|---|---|
| Read scaling, transactional integrity matters | CQRS (write = OLTP, read = denormalised) |
| Audit trail required by regulator | Event sourcing |
| Multi-step explicit workflow with rollback | Saga + orchestration (Temporal, Step Functions) |
| Many independent reactions to "thing happened" | Choreography (Kafka, EventBridge, Pub/Sub) |
| Real-time dashboards from transactional stream | Kappa (stream-first), CQRS read side |
| All of the above | Polyglot: pick per concern, not one-size-fits-all |

---

## Related

- [Event-Driven Architecture](../architecture/event-driven.md)
- [CQRS](../patterns/cqrs.md)
- [Event Sourcing](../patterns/event-sourcing.md)
- [Saga Pattern](../patterns/saga-pattern.md)
- [Choreography vs Orchestration](../architecture/choreography-vs-orchestration.md)
- [Outbox Pattern](../patterns/outbox.md)
- [Lambda & Kappa Architectures](../architecture/lambda-kappa-architectures.md)
