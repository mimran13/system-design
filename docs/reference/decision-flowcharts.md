---
tags:
  - applied
---

# Decision Flowcharts

When you're designing rather than diagnosing. 11 decision trees for the most common architectural choices, each with one-line rationale per branch.

This page is the **decision-tool complement** to [Symptom → Concept Lookup](symptom-lookup.md). Symptom Lookup = "I see X, what is it?" Flowcharts = "I'm choosing, what should I pick?"

Use these as starting points — every real decision has more nuance than a flowchart can carry. Each tree links to the relevant concept pages for depth.

!!! tip "Interactive"
    Leaf nodes with a dotted underline are clickable — they jump straight to the recommended concept page. Click any diagram to expand it fullscreen.

<div class="sd-mermaid-links" data-links='{
  "SQL": "../../storage/relational-databases/",
  "Key-value: DynamoDB, Redis": "../../storage/key-value-stores/",
  "Document: MongoDB, Firestore": "../../storage/document-stores/",
  "TSDB: TimescaleDB, ClickHouse": "../../storage/time-series-databases/",
  "REST broadly understood, easy to consume": "../../api/rest/",
  "gRPC binary, schema-first, faster": "../../api/grpc/",
  "GraphQL client specifies fields": "../../api/graphql/",
  "Stream: Kafka, Kinesis": "../../messaging/event-streaming/",
  "Pub/Sub: SNS, EventBridge, Redis Pub/Sub": "../../messaging/pub-sub/",
  "Queue: SQS, RabbitMQ": "../../messaging/message-queues/",
  "Async with polling or webhook callback": "../../api/webhooks/",
  "Async message queue": "../../messaging/message-queues/",
  "Event-driven pub/sub or stream": "../../architecture/event-driven/",
  "Write-through: write to cache + DB together": "../../caching/caching-strategies/",
  "Cache-aside app loads on miss": "../../caching/caching-strategies/",
  "Write-back cache → DB later": "../../caching/caching-strategies/",
  "Partition within the DB native range/list/hash partitioning": "../../fundamentals/partitioning-fundamentals/",
  "Read replicas + caching before any sharding": "../../patterns/read-replicas/",
  "Shard across machines app-level, Vitess, or Citus": "../../patterns/sharding-tooling/",
  "Fix indexes / queries first partitioning won't help": "../../fundamentals/database-internals-deep-dive/",
  "Shard by user_id / tenant_id even distribution; natural per-tenant queries": "../../patterns/sharding/",
  "Shard by content hash even distribution; no natural locality": "../../patterns/consistent-hashing/",
  "Shard by region/country compliance + locality, but skew risk": "../../architecture/multi-region/",
  "⚠️ time-based shard = all writes hit latest shard = hot": "../../fundamentals/hot-partitions/",
  "Combine: shard by metric_name + time bucket": "../../storage/time-series-databases/",
  "Choreography: services subscribe to events": "../../architecture/event-driven/",
  "Orchestration: workflow engine like Temporal": "../../patterns/durable-workflows/",
  "Active-passive warm standby; 1.2-1.5× cost": "../../architecture/multi-region/",
  "Read replicas in regions + primary for writes": "../../patterns/read-replicas/",
  "Active-active 2-3× cost; conflict strategy needed": "../../architecture/multi-region/",
  "Per-tenant region each tenant lives in one region": "../../architecture/multi-tenancy/",
  "Monolith or modular monolith": "../../architecture/monolith-vs-microservices/",
  "Modular monolith": "../../architecture/modular-monolith/",
  "Microservices around bounded contexts": "../../architecture/microservices-patterns/",
  "Modular monolith is fine forever": "../../architecture/modular-monolith/",
  "Pure batch: dbt on warehouse, scheduled ETL": "../../storage/modern-data-stack/",
  "Lambda: batch + stream + serving": "../../architecture/lambda-kappa-architectures/",
  "Kappa: stream-only with replay": "../../architecture/lambda-kappa-architectures/",
  "Lakehouse: Delta/Iceberg on S3, both engines access": "../../storage/modern-data-stack/"
}'></div>

---

## 1. SQL or NoSQL?

```mermaid
graph TD
    A[Picking a database] --> B{Strong consistency<br/>across rows needed?}
    B -->|yes| C[SQL]
    B -->|maybe| D{Complex joins<br/>across many tables?}
    D -->|yes| C
    D -->|no| E{Single-key lookup<br/>at huge scale?}
    E -->|yes| F[Key-value: DynamoDB, Redis]
    E -->|no| G{Document with<br/>flexible schema?}
    G -->|yes| H[Document: MongoDB, Firestore]
    G -->|no| I{Time-series data?}
    I -->|yes| J[TSDB: TimescaleDB, ClickHouse]
    I -->|no| C
```

**Default**: SQL (Postgres). Don't pick NoSQL "for scale" unless you've actually outgrown Postgres or your access pattern genuinely doesn't fit.

→ [SQL vs NoSQL](../storage/sql-vs-nosql.md)
→ [Storage section overview](../storage/index.md)

---

## 2. REST, gRPC, or GraphQL?

```mermaid
graph TD
    A[Picking an API style] --> B{External / public<br/>API for third-parties?}
    B -->|yes| C[REST<br/>broadly understood, easy to consume]
    B -->|no| D{Internal service-to-service?}
    D -->|yes| E{Need low latency,<br/>strict contracts?}
    E -->|yes| F[gRPC<br/>binary, schema-first, faster]
    E -->|no| C
    D -->|no, frontend BFF| G{Many clients want<br/>different field shapes?}
    G -->|yes| H[GraphQL<br/>client specifies fields]
    G -->|no| C
```

**Defaults**: REST for external, gRPC for service-to-service, GraphQL when frontend needs flexibility.

→ [REST vs gRPC vs GraphQL](../api/comparison.md)
→ [API Design overview](../api/index.md)

---

## 3. Queue, stream, or pub/sub?

```mermaid
graph TD
    A[Picking async messaging] --> B{Need to replay<br/>history of events?}
    B -->|yes| C[Stream: Kafka, Kinesis]
    B -->|no| D{One producer →<br/>many subscribers fan-out?}
    D -->|yes| E[Pub/Sub: SNS, EventBridge,<br/>Redis Pub/Sub]
    D -->|no| F{Work to do once,<br/>by one worker?}
    F -->|yes| G[Queue: SQS, RabbitMQ]
    F -->|no| H{Ordering critical<br/>per key?}
    H -->|yes| C
    H -->|no| G
```

**Rule of thumb**: SQS for "do this work," SNS/EventBridge for "tell everyone," Kafka for "everything that happened, with replay."

→ [Message Queues](../messaging/message-queues.md)
→ [Pub/Sub](../messaging/pub-sub.md)
→ [Event Streaming](../messaging/event-streaming.md)

---

## 4. Sync, async, or scheduled?

```mermaid
graph TD
    A[Picking work invocation] --> B{Caller needs<br/>the answer back?}
    B -->|yes| C{Can wait <1s?}
    C -->|yes| D[Sync HTTP/gRPC call]
    C -->|no| E[Async with polling<br/>or webhook callback]
    B -->|no| F{Time-sensitive<br/>completion?}
    F -->|yes| G[Async message queue]
    F -->|no, runs on schedule| H[Cron / scheduled job]
    F -->|no, runs on event| I[Event-driven<br/>pub/sub or stream]
```

**Default**: sync only when caller actually needs the answer right now. Everything else is async-by-default.

→ [Choreography vs Orchestration](../architecture/choreography-vs-orchestration.md)
→ [Event-Driven Architecture](../architecture/event-driven.md)

---

## 5. Cache strategy?

```mermaid
graph TD
    A[Adding a cache] --> B{Read-heavy<br/>or write-heavy?}
    B -->|read-heavy| C{Read-after-write<br/>consistency needed?}
    C -->|yes, strict| D[Write-through:<br/>write to cache + DB together]
    C -->|no, eventual OK| E[Cache-aside<br/>app loads on miss]
    B -->|write-heavy| F{Acceptable to lose<br/>last writes on crash?}
    F -->|yes| G[Write-back<br/>cache → DB later]
    F -->|no| H[Cache-aside or<br/>skip caching writes]
```

**Default**: cache-aside (lazy loading). Most common, simplest, eventual consistency. Add write-through only when strict read-after-write is required.

→ [Caching Strategies](../caching/caching-strategies.md)
→ [Cache Patterns & Pitfalls](../caching/cache-patterns.md)

---

## 6. Partition or shard?

The table is big — do you partition within one database, or shard across machines?

```mermaid
graph TD
    A[Big table is slowing down] --> B{Is one machine<br/>actually exhausted?<br/>CPU / IOPS / RAM / storage}
    B -->|no| C{Queries filter on a<br/>natural key — time, tenant, region?}
    C -->|yes| D[Partition within the DB<br/>native range/list/hash partitioning]
    C -->|no| E{Slow because of<br/>old data you never query?}
    E -->|yes| D
    E -->|no| F[Fix indexes / queries first<br/>partitioning won't help]
    B -->|yes| G{Exhausted by reads<br/>or writes?}
    G -->|reads| H[Read replicas + caching<br/>before any sharding]
    G -->|writes / storage| I{Clear shard key covering<br/>95%+ of queries?}
    I -->|yes| J[Shard across machines<br/>app-level, Vitess, or Citus]
    I -->|no| K[⚠️ Fix the data model first —<br/>sharding without a key is pain]
```

**Default order**: indexes/queries → partitioning → read replicas + cache → sharding. Each step is ~10x cheaper to operate than the next.

| | Partitioning (one DB) | Sharding (many machines) |
|---|---|---|
| **Solves** | Slow scans, bloated indexes, data lifecycle | One machine can't hold the load |
| **Routing** | DB does it — queries unchanged | App/proxy must route by shard key |
| **Joins & transactions** | Still work normally | Cross-shard = hard, redesign needed |
| **Ops cost** | Near zero (native feature) | High — migrations, rebalancing, per-shard failover |
| **Reach for it when** | Time-series, drop-old-data, query pruning | >5 TB or >10K write QPS with a clear key |

→ [Partitioning Fundamentals](../fundamentals/partitioning-fundamentals.md)
→ [Sharding](../patterns/sharding.md)
→ [Sharding Tooling (Vitess / Citus)](../patterns/sharding-tooling.md)

---

## 7. Sharding key — how do you partition?

```mermaid
graph TD
    A[Picking a shard key] --> B{Access pattern}
    B -->|by user/tenant| C[Shard by user_id / tenant_id<br/>even distribution; natural per-tenant queries]
    B -->|by time/timestamp| D[⚠️ time-based shard<br/>= all writes hit latest shard = hot]
    B -->|by content| E[Shard by content hash<br/>even distribution; no natural locality]
    B -->|by geography| F[Shard by region/country<br/>compliance + locality, but skew risk]
    
    D --> G{Need time-series queries?}
    G -->|yes| H[Combine: shard by metric_name<br/>+ time bucket]
    G -->|no| I[Use hash-based instead]
```

**Default**: hash of user_id or tenant_id. Time-based partitioning has hot-shard problems unless you sub-shard by metric/key.

→ [Sharding](../patterns/sharding.md)
→ [Consistent Hashing](../patterns/consistent-hashing.md)
→ [Hot Partitions](../fundamentals/hot-partitions.md)

---

## 8. Choreography or orchestration?

```mermaid
graph TD
    A[Multi-service workflow] --> B{Workflow has explicit<br/>steps with order?}
    B -->|no, just reactions to events| C[Choreography:<br/>services subscribe to events]
    B -->|yes| D{Failures need<br/>compensating actions?}
    D -->|yes| E[Orchestration:<br/>workflow engine like Temporal]
    D -->|no| F{Long-running<br/>with waits / human steps?}
    F -->|yes| E
    F -->|no| G{Many independent<br/>reactions to same event?}
    G -->|yes| C
    G -->|no| E
```

**Rule of thumb**: orchestration for explicit business workflows with rollback. Choreography for fan-out and decoupled reactions.

→ [Choreography vs Orchestration](../architecture/choreography-vs-orchestration.md)
→ [Saga Pattern](../patterns/saga-pattern.md)

---

## 9. Multi-region — active-active, active-passive, or single?

```mermaid
graph TD
    A[Multi-region decision] --> B{Why do you need it?}
    B -->|cost-driven scaling| C[⚠️ Reconsider —<br/>single region scales further than you think]
    B -->|disaster recovery only| D[Active-passive<br/>warm standby; 1.2-1.5× cost]
    B -->|global user latency| E{Read-heavy?}
    E -->|yes| F[Read replicas in regions<br/>+ primary for writes]
    E -->|no, lots of writes| G[Active-active<br/>2-3× cost; conflict strategy needed]
    B -->|data residency / regulatory| H[Per-tenant region<br/>each tenant lives in one region]
```

**Default**: stay single-region until you have a specific driver. Multi-region cost = 2-3×; complexity is much higher.

→ [Multi-Region Architecture](../architecture/multi-region.md)
→ [Edge Architecture](../architecture/edge-architecture.md)

---

## 10. Monolith, modular monolith, or microservices?

```mermaid
graph TD
    A[Architectural style] --> B{Team size?}
    B -->|1-10 engineers| C[Monolith or<br/>modular monolith]
    B -->|10-50 engineers| D[Modular monolith]
    B -->|50+ engineers| E{Need independent<br/>deploy cadence?}
    E -->|yes| F[Microservices around<br/>bounded contexts]
    E -->|no| D
    
    D --> G{Need polyglot stack<br/>or very different scaling?}
    G -->|yes| F
    G -->|no| H[Modular monolith<br/>is fine forever]
```

**Default for new builds**: modular monolith. Microservices are a destination, not a starting point.

→ [Monolith vs Microservices](../architecture/monolith-vs-microservices.md)
→ [Modular Monolith](../architecture/modular-monolith.md)

---

## 11. Lambda, Kappa, or just batch?

```mermaid
graph TD
    A[Big-data architecture] --> B{Need real-time<br/>aggregations?}
    B -->|no, daily refresh fine| C[Pure batch:<br/>dbt on warehouse, scheduled ETL]
    B -->|yes| D{Strong correctness via<br/>nightly reprocessing required?}
    D -->|yes, compliance| E[Lambda:<br/>batch + stream + serving]
    D -->|no, stream correctness OK| F[Kappa:<br/>stream-only with replay]
    F --> G{Need to mix batch and stream<br/>without two codebases?}
    G -->|yes| H[Lakehouse: Delta/Iceberg<br/>on S3, both engines access]
```

**Default for new builds (2026)**: Kappa with lakehouse storage. Lambda persists for legacy / compliance.

→ [Lambda & Kappa Architectures](../architecture/lambda-kappa-architectures.md)
→ [Data Warehousing](../storage/data-warehousing.md)

---

## How to use these flowcharts

```
1. Find the tree closest to your decision
2. Walk down it answering each question honestly
3. Land on a leaf — that's your default
4. Read the linked concept pages for depth on trade-offs
5. Adjust based on your specific context

Anti-pattern: treating a flowchart as gospel.
Reality: every "default" has exceptions; the tree helps you spot when you're choosing differently and why.
```

---

## What flowcharts can't capture

Some decisions resist a flowchart because the right answer depends on the **interaction** of multiple factors. For those, see:

- [Quality Attributes](../architecture/quality-attributes.md) — multi-dimensional trade-off analysis
- [ADRs](../architecture/adrs.md) — how to document non-trivial decisions
- [Architecture Styles Comparison](../architecture/styles-comparison.md) — side-by-side trade-off matrix
- [Practical Examples](../examples/index.md) — concepts combined in real scenarios

---

## Related

- [Symptom → Concept Lookup](symptom-lookup.md) — diagnostic complement to these decision tools
- [Practical Examples](../examples/index.md) — concepts applied in concrete scenarios
- [AWS Mapping](../aws/index.md) — once you've decided on a concept, what AWS service implements it
