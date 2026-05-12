# CQRS and Event Sourcing as Architecture

CQRS (Command Query Responsibility Segregation) and Event Sourcing are often introduced as patterns. At larger scale and complexity, they become **the** architecture — shaping the entire system, not just one feature. This page focuses on the architectural framing: when CQRS+ES is the *style* of a system, the consequences, and the trade-offs.

For the pattern-level mechanics, see [CQRS](../patterns/cqrs.md) and [Event Sourcing](../patterns/event-sourcing.md).

---

## You'll see this when...

- Banking, trading, healthcare — domains with audit/regulatory requirements
- "We need to know what the data looked like at any point in time"
- Multiple read models (Postgres for ops, ElasticSearch for search, Redshift for analytics) all derived from same writes
- EventStoreDB, Axon Framework, Marten, or Eventuous in the stack
- "Aggregate", "command handler", "event handler", "projection" appear in code
- Architects mention "DDD aggregates" alongside CQRS
- Domain has rich behaviour, not just CRUD
- Need to rebuild analytics views from scratch without touching live system

---

## Cost reality

CQRS+ES is operationally expensive. Rough estimates (AWS, 2026):

```
CQRS only (no event sourcing):
  Write store:       $500-3K/month (Postgres / RDS)
  Event bus:         $200-2K/month (Kafka / Kinesis)
  Read model store:  $500-2K/month (ES / Redis / second Postgres)
  Stream processors: $200-1K/month (Flink / Kafka Streams runtime)
  Observability:     extra spend on tracing + replication lag
  Ops overhead:      ~0.5 FTE (multiple stores, projection management)
  Total:             $2K-10K/month + 0.5 FTE

Full CQRS + Event Sourcing:
  Event store:       $300-2K/month (EventStoreDB / Marten / DynamoDB)
  + everything above
  Snapshot infra:    storage + scheduled jobs
  Schema registry:   meaningful at scale
  Ops overhead:      ~1 FTE (replay tooling, projection rebuilds, event versioning)
  Total:             $3K-15K/month + 1 FTE
```

Compare to a simple Postgres-only design: $200-2K/month, 0.1 FTE. The 5-10× cost is justifiable only when the audit/replay/independent-read-models requirement is real.

Don't adopt CQRS+ES "for scale" or "for cleanliness" — the cost outpaces the benefit at small scale.

---

## CQRS as architecture

Standard architecture: one model handles both commands (writes) and queries (reads).

```
Client ──► Service ──► Database (one model)
              │           │
              writes    reads
```

CQRS separates them:

```
                    ┌──► Command model ──► Write DB ──► Events
                    │
Client ──► Service ─┤
                    │
                    └──► Query model ──► Read DB(s) (denormalised, indexed)
```

Two models. Two persistence strategies. Two scaling axes.

---

## Why "as architecture" not "as pattern"

CQRS-as-pattern: applied to one bounded context. The order service uses CQRS internally; everything else doesn't.

CQRS-as-architecture: the entire system is shaped by CQRS:

- All write APIs accept commands; all read APIs serve queries
- Read models built from a stream of events from write models
- Read models exist for every query type, optimised for that query
- Polyglot persistence: write side might be Postgres, reads might be ElasticSearch + Redis + Mongo

The system's identity is "command/query/event" — that's the architecture.

---

## Event Sourcing as architecture

Standard: store current state in tables.

```
account
  id    | balance
  ------+--------
  alice |   100
```

Event-sourced: store every change; current state is derived by replay.

```
events:
  AccountOpened(alice, 0)
  Deposited(alice, 50)
  Deposited(alice, 100)
  Withdrew(alice, 50)

current state computed by replay:
  alice → 100
```

The event log is the **system of record**. Tables are just a derived view.

---

## CQRS + ES as architecture

Together, they reshape the system:

```
Client ──► Command ──► Validate ──► Append event(s) ──► Event store
                                                         │
                                                         ▼
                                                    Project to read model A (Postgres)
                                                    Project to read model B (ES)
                                                    Project to read model C (Mongo)
                                                    Publish to Kafka topic
                                                    
Client ──► Query ──► Read model (eventually consistent)
```

Properties:

- **Write side** is small, focused on validation + emitting events
- **Read side** is wherever you want, however many you want, all derived
- **Audit trail** is automatic — events are the truth
- **Time travel** — replay events to past state
- **New views** — add a new read model by replaying past events

---

## When this architecture fits

```
✓ Audit / regulatory requirements (financial, healthcare, government)
✓ Complex domain with rich behaviour (trading, banking, supply chain)
✓ Need for time-travel debugging or temporal queries
✓ High read scaling needs with diverse query patterns
✓ Mature DDD practice with bounded contexts
✓ Team with capacity to handle the complexity

✗ Simple CRUD applications
✗ Strong read-after-write consistency required everywhere
✗ Small team or product
✗ Regulatory requirement to delete data (GDPR — events are immutable)
✗ Reporting / queries that need joins across many aggregates
```

CQRS+ES is **expensive in cognitive overhead**. The benefits compound at scale and complexity; for small teams or simple problems, they don't justify the cost.

---

## Architectural consequences

### Eventual consistency between writes and reads

```
Command: deposit($100)
  → event written to event store
  → command returns success
  → ... 200ms later ...
  → read model updated via projection
  → client query reflects deposit
```

The read model lags the write side by milliseconds to seconds. UI must handle this:

- Optimistic updates ("we recorded your deposit; it'll show in your balance shortly")
- Read your own writes (route the user's reads to the latest projection)
- Notification on read model catching up

This is one of the biggest cognitive shifts. Engineers used to "write then read" expect immediate visibility.

### Schema evolution is via projections

Old data structure:
```
{ "userId": 123, "name": "alice" }
```

New data structure:
```
{ "userId": 123, "firstName": "alice", "lastName": "smith" }
```

In a non-ES system: data migration script.

In ES: no migration. Replay events into the new projection schema. The events themselves don't change.

For the events themselves to evolve, you need event versioning — events are immutable but new versions can be added.

### New read models are cheap (sort of)

Need a new query? Add a new projection. Replay events from the start. Ship.

Caveat: replaying years of events takes time. Real systems use snapshots (state at time T) + events since T to bootstrap.

### Operational complexity

```
Components running:
  - Event store (specialised: EventStoreDB, Axon, Kafka with care)
  - N read model stores
  - N projection processes
  - Snapshotting infrastructure
  - Replay tooling for new projections
  - Event schema registry
  - Monitoring for projection lag
```

Compared to "one Postgres," this is a lot.

### Debugging shifts

Production incidents debugged by examining the event stream. "What happened?" → trace through events.

Tools:

- Event log viewers
- Event replay in staging to reproduce production state
- Time-travel debugging (move read model to past state)

These are powerful but require investment.

---

## Bounded contexts

CQRS+ES amplifies the importance of [bounded contexts](ddd.md). Each context has:

- Its own commands and queries
- Its own events
- Its own read models
- Its own event store partition

Cross-context communication is via published events:

```
Order context publishes OrderPlaced
  → Inventory context consumes, updates stock
  → Notification context consumes, sends email
```

This is essentially [event-driven architecture](event-driven.md) under the hood, with CQRS+ES as the internal style of each context.

---

## Snapshots

Replaying years of events on every query is impractical:

```
Snapshot: aggregate state at event 10,000
   ↓
On load: replay snapshot, then events 10,001 onwards
```

Snapshots are a pure optimisation; they're not the source of truth. Drop and rebuild as needed.

Frequency: typically every N events, or on demand. Trade-off: more snapshots = faster loads, more storage.

---

## Sagas in CQRS+ES

Long-running processes that span aggregates / contexts:

```
Order placed
  → SagaStarted
  → reserve inventory (command to inventory context)
  → InventoryReserved (event back)
  → charge payment (command to payment context)
  → PaymentCharged (event back)
  → confirm order (command to order context)
  → SagaCompleted
```

Each step is a command/event pair. Sagas track their state and react to events. See [Saga Pattern](../patterns/saga-pattern.md).

---

## Real-world examples

### Banking core

Every transaction = event. Account state = projection. Auditors love it.

### Order management at scale

Order events drive: order status (Postgres), search (ES), analytics (warehouse), customer notifications. Each consumer has its own read model.

### Trading platforms

Order book state derived from order placement / cancellation events. Replay enables backtesting.

### Healthcare

Patient record = events (admission, treatment, discharge). Audit trail is the requirement, not a nice-to-have.

### Logistics / supply chain

Shipment lifecycle as events. Multiple parties' systems consume and project.

---

## Common pitfalls

**1. Treating it as required for everything.**

A CRUD admin tool doesn't need event sourcing. Use it where it pays — typically the core domain, not the periphery.

**2. Underestimating eventual consistency.**

UI assumptions of read-after-write fail. Need to design for "this'll show up in a moment" semantics.

**3. Event schema mistakes.**

Events are immutable. A bad event schema is forever. Versioning, additive evolution, careful naming matter.

**4. No replay / snapshot story.**

When the read model gets corrupted, you need to rebuild it from events. If "rebuild" takes weeks, you're in trouble.

**5. Cross-context queries.**

CQRS makes queries within a context easy. Joining across contexts requires projecting into a combined read model — which adds complexity.

**6. GDPR / data deletion.**

Events are immutable; "right to be forgotten" is hard. Solutions: encrypt PII with per-user keys, delete the key on request — events still exist but are unreadable.

---

## Anti-patterns

| Anti-pattern | Problem |
|---|---|
| ES on a CRUD system | Massive complexity tax for no benefit |
| Mutating events | Defeats the entire model |
| Single global event stream | Bottleneck; should be per aggregate |
| Read models that join across contexts at query time | Should be denormalised projections |
| No snapshotting | Loads scale with event count → unusable |
| Same store for commands and queries | Defeats CQRS scaling benefit |

---

## Tools

| Tool | Role |
|---|---|
| **EventStoreDB** | Purpose-built event store with subscriptions |
| **Axon Framework** (Java) | CQRS+ES framework |
| **Eventuous** (.NET) | CQRS+ES library |
| **Marten** (.NET on Postgres) | Document + event store on Postgres |
| **Kafka** | Used as event log; needs care for true ES |
| **DynamoDB Streams** | AWS-native event stream from a key-value store |

Most teams build on top of these rather than rolling their own event store. The complexity of "do it right" is high.

---

## Migration paths

Existing CRUD system → CQRS+ES is hard. Common approach:

1. **Outbox pattern** to publish events alongside writes
2. **Build read models** from those events; verify they match the existing system
3. **Cut over reads** to new read models gradually
4. **Eventually**: write side becomes commands → events; existing tables become projections

Many teams stop at step 2 — eventing-out + denormalised read models, without full ES. That's a reasonable place to land.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you treat CQRS+ES as a serious architectural commitment, not just "we save events sometimes."

**Strong answer pattern:**
1. CQRS = separate write model and read model(s); ES = events as system of record
2. Eventual consistency is the architectural cost; design UI accordingly
3. New read models cheap to add; replay events into them
4. Snapshots, projections, schema evolution, GDPR are real operational concerns
5. Right for complex/audit-heavy domains; wrong for CRUD
6. Migration via outbox + projections is incremental

**Common follow-up:** *"How do you handle GDPR's right-to-be-forgotten with immutable events?"*
> Crypto-shredding. Encrypt PII fields in events with per-user keys. Store keys in a separate, mutable store. On deletion request, delete the key — events still exist but the PII fields are unreadable. This satisfies the legal requirement (data is unrecoverable) without violating event immutability. Implementation detail: events still hold the encrypted bytes, so storage requirement persists, but the data is effectively gone.

---

## Related topics

- [CQRS pattern](../patterns/cqrs.md) — mechanics
- [Event Sourcing pattern](../patterns/event-sourcing.md) — mechanics
- [Event-Driven Architecture](event-driven.md) — broader event style
- [Domain-Driven Design](ddd.md) — bounded contexts and aggregates
- [Saga Pattern](../patterns/saga-pattern.md) — long-running workflows
- [Outbox Pattern](../patterns/outbox.md) — eventing alongside DB writes
