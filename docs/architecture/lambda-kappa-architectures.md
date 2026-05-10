# Lambda and Kappa Architectures

Two architectural patterns for processing large-scale data: **Lambda** (combine batch + stream for accuracy + freshness), **Kappa** (stream-only, simpler). Both deal with the fundamental tension between completeness (batch) and latency (stream). Modern data architectures increasingly lean Kappa, but Lambda still appears in regulatory or correctness-critical pipelines.

---

## The problem

Big data processing has two natural tensions:

```
Latency:        How fresh do results need to be?
Completeness:   Do we need every event, in order, exactly once?
```

Stream processing optimises for low latency but historically struggled with correctness (out-of-order events, replays, exactly-once). Batch processing optimises for completeness but adds hours of lag.

Lambda and Kappa are two answers to this tension.

---

## Lambda Architecture

```
                   ┌──────────────────────────┐
                   │     Batch layer          │
                   │  (Hadoop/Spark)          │
                   │  reprocess all data      │
                   │  every N hours           │
                   └─────────────┬────────────┘
                                 │
Raw events ──┬──────────────────►│
             │                    │
             │                    ▼
             │           ┌────────────────┐
             │           │ Batch view     │
             │           │ (complete,     │
             │           │  hours stale)  │
             │           └───────┬────────┘
             │                   │
             │                   ▼
             │           ┌────────────────┐
             │           │  Serving layer │
             │           │  (merge views) │
             │           └────────┬───────┘
             │                    ▲
             │                    │
             │           ┌────────────────┐
             │           │ Speed view     │
             │           │ (fresh, may    │
             │           │  be incomplete)│
             │           └───────▲────────┘
             │                   │
             │           ┌───────────────┐
             └──────────►│ Speed layer   │
                         │ (Storm/Flink) │
                         │ stream now    │
                         └───────────────┘
```

Three layers:

1. **Batch layer**: re-processes the complete dataset on a schedule. Produces accurate, complete results. Hours of lag.
2. **Speed layer**: stream-processes new events. Produces approximate, recent results. Seconds of lag.
3. **Serving layer**: queries combine the two — batch view for everything before time T, speed view for events after T.

When the batch run completes, the speed view "before T" is discarded — the batch view is now authoritative for that range.

### Why it was invented

Pre-2015, stream processors couldn't reliably do exactly-once, handle out-of-order events, or reprocess history. Lambda gave you:

- **Eventual correctness** via batch reprocessing
- **Recent results** via stream
- **Tolerance for stream-layer bugs** (batch reprocessing fixes them)

This was the standard for big-data platforms ~2010-2018.

### Drawbacks

- **Two codebases** for the same logic — batch in Spark/Scalding, stream in Storm/Spark Streaming
- **Code drift** — same logic implemented twice tends to diverge
- **Complex operations** — two pipelines to monitor, deploy, debug
- **Reconciliation logic** in serving layer
- **Cost** — running both layers continuously

---

## Kappa Architecture

```
                                   ┌──────────────┐
Raw events ──► Append-only log ───►│Stream proc.  │───► Output store
              (Kafka, Pulsar)      │(Flink, Kafka │
                  │                │ Streams)     │
                  │                └──────────────┘
                  │
                  └──── Replay from offset 0 to reprocess history
```

Single pipeline. Stream-only. To "reprocess history," replay from the beginning of the log into a new version of the pipeline.

### Why it works now

Modern stream processors handle:

- **Exactly-once semantics** (Kafka transactions, Flink checkpoints)
- **Event-time processing** with watermarks (handle out-of-order)
- **Stateful operations** with durable state stores
- **Replay** from log retention

If your stream processor can do batch-level correctness, you don't need a separate batch layer.

### Replay mechanics

```
Need to fix a bug or add a new metric?
  1. Spin up new pipeline reading from offset 0
  2. Outputs go to a new index / table
  3. When caught up to live, switch traffic to new pipeline
  4. Old pipeline + outputs decommissioned
```

This is the "rebuild instead of patch" model. Same as event-sourced systems.

Requires:

- **Long log retention** (Kafka can keep weeks/months/years)
- **Idempotent processing** so replays are safe
- **Versioned output stores** so old + new run side-by-side

### Drawbacks

- **Long replay times** for large histories — minutes to days depending on volume
- **Storage cost** — keeping the full event log isn't free
- **Stream-processing complexity** — exactly-once, watermarks, state management aren't trivial
- **Less mature for complex SQL-style analytics** — though Flink SQL closed the gap

---

## Lambda vs Kappa

| | Lambda | Kappa |
|---|---|---|
| Layers | Two (batch + stream) | One (stream) |
| Code duplication | Yes | No |
| Reprocessing model | Re-run batch | Replay stream |
| Correctness guarantee | Strong (batch is source of truth) | Strong (modern exactly-once stream) |
| Operational cost | Higher | Lower |
| Latency for new events | Speed layer (~seconds) | Stream (~seconds) |
| Reprocessing latency | Batch interval (~hours) | Replay duration (variable) |
| Best fit | Legacy big-data; specific compliance needs | Modern event-driven systems |

For most new builds, **Kappa is the default**. Lambda still has a place where:

- Batch tooling is mature (Spark, dbt) and stream tooling isn't trusted yet
- Compliance requires "official daily numbers" from a batch job
- Existing batch infra is too valuable to retire

---

## Modern equivalents

The Lambda/Kappa terminology has faded; the patterns persist:

| Pattern | Modern equivalent |
|---|---|
| Lambda | Stream + nightly batch reprocessing job; lakehouse architectures |
| Kappa | Stream-first pipelines on Kafka + Flink / Kafka Streams |
| Lakehouse | Delta Lake / Iceberg / Hudi — table format that supports both batch and stream natively |

Lakehouse is interesting: a single storage format (Parquet + transaction log) accessible by both batch (Spark, Trino) and stream (Flink, Kafka Streams) tools. Removes the layered duplication of Lambda while keeping batch tooling available.

---

## Where each fits

### Choose Lambda when:

- Existing batch infrastructure (Hadoop, Spark) is the foundation
- Compliance / regulatory: "the daily totals come from the batch run"
- Heavy ad-hoc analytics need a stable, complete dataset
- Stream processing in your stack is immature

### Choose Kappa when:

- Building from scratch
- Stream-first culture (Kafka-native)
- Reprocessing happens occasionally, not constantly
- Real-time semantics are core (analytics + serving)

### Choose lakehouse when:

- You want both, without two codebases
- Iceberg / Delta / Hudi tooling fits the team

Most large data orgs end up with hybrid: Kappa for real-time, batch for cost-efficient bulk transformations, on shared lakehouse storage.

---

## Examples

### Streaming analytics dashboard

Pure Kappa:

```
App events → Kafka → Flink (windowed aggregations) → ClickHouse → Dashboard
```

Reprocessing: bump version, replay Kafka, switch dashboard to new ClickHouse index.

### Financial transaction reporting

Lambda-flavoured:

```
Transactions → Kafka → 
                ├── Flink: real-time fraud signals (speed)
                └── S3 → Spark: nightly batch reconciliation, regulatory reports
```

Daily batch is the "books-of-record" view; real-time is for operational decisions.

### Search index

Kappa:

```
Document changes → Kafka → ElasticSearch (sink connector)
                                    ▲
                                    │
                          Replay from offset 0 to rebuild
```

When the schema changes, build a new index by replaying.

### Recommendation system

Often Lambda:

```
User events → 
  ├── Stream: real-time CTR signals (speed view; for online learning)
  └── Batch: nightly model training on full history (batch view)
  
Both feed serving layer.
```

The model is too expensive to retrain in real time; CTR adjustments happen in stream.

---

## Common implementation choices

### Stream processors

| Tool | Notes |
|---|---|
| **Apache Flink** | Most powerful; best stateful + event-time |
| **Kafka Streams** | Tightly Kafka-integrated; library, not framework |
| **Apache Spark Streaming / Structured Streaming** | Batch-flavoured streaming |
| **Apache Beam** | Portable model; runs on Flink, Spark, Dataflow |
| **Apache Pulsar Functions** | Pulsar-native |

### Batch processors

| Tool | Notes |
|---|---|
| **Apache Spark** | Dominant batch engine |
| **dbt** | SQL-based transformations on warehouse |
| **Trino / Presto** | Federated SQL across stores |

### Event logs / message buses

| Tool | Notes |
|---|---|
| **Apache Kafka** | The industry standard |
| **Apache Pulsar** | Layered storage, multi-tenant |
| **AWS Kinesis** | Managed; smaller ecosystem |
| **Redpanda** | Kafka-compatible, no JVM |

### Lakehouse formats

| Format | Notes |
|---|---|
| **Delta Lake** | Databricks-driven; broadest tooling |
| **Apache Iceberg** | Open governance; broad adoption |
| **Apache Hudi** | Stream-friendly; optimised for incremental loads |

---

## Key concepts to know

### Event time vs processing time

```
Event time:       when the event actually happened
Processing time:  when the system processed it
```

Stream processors handle out-of-order events with **watermarks** — "I've seen all events up to time T."

### Exactly-once semantics

End-to-end guarantee that each event affects state exactly once, even with failures and replays. Kafka transactions + Flink checkpoints make this practical. See [Exactly-Once Semantics](../distributed/exactly-once.md).

### Stateful stream processing

Aggregations, joins, deduplication require state. Stream processors store state in durable, partitioned state stores (RocksDB-based in Flink, Kafka-backed in Kafka Streams).

### Backpressure

When a downstream component is slower, the system must slow upstream rather than buffer infinitely. See [Backpressure](../messaging/backpressure.md).

---

## Migrating Lambda → Kappa

Common pattern as orgs modernise:

```
Phase 1: Build stream pipeline alongside existing batch
Phase 2: Verify stream output matches batch (validation)
Phase 3: Cut serving layer to use stream output for live data
Phase 4: Run batch in parallel for a quarter to confirm
Phase 5: Decommission batch pipeline (or keep for ad-hoc analytics)
```

The risk is in step 2 — validating that stream truly matches batch is hard, especially for complex aggregations. Worth investing in.

---

## When neither fits

Some workloads don't need either:

- **Pure OLTP**: just use a database; no need for streaming infrastructure
- **Simple ELT**: dbt on a warehouse covers many use cases
- **Periodic reports only**: a cron job + SQL is enough
- **Event-driven microservices**: domain events for choreography, not data analytics

Lambda/Kappa are about **large-scale data processing**. They're heavyweight; only adopt when the scale demands it.

---

## Anti-patterns

| Anti-pattern | Problem |
|---|---|
| Lambda for small data | Two codebases without justification |
| Kappa with no replay capacity | Can't fix bugs or evolve schema |
| Stream processor without exactly-once | Silently inaccurate aggregates |
| Logging straight to a warehouse without intermediate log | No replay; no decoupling |
| Mixing event time and processing time silently | Subtle correctness bugs |
| Pipeline-as-code in only one place (UI / notebook) | Hard to version, review, redeploy |

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you understand the tension between freshness and correctness in big-data pipelines.

**Strong answer pattern:**
1. Lambda: batch + stream + serving layer that combines them; two codebases
2. Kappa: stream-only with replay for reprocessing; one codebase
3. Modern stream processors (Flink, Kafka Streams) made Kappa viable around 2018+
4. Lakehouse formats (Iceberg, Delta) blend both without code duplication
5. Most new builds default to Kappa; Lambda persists for compliance / legacy reasons

**Common follow-up:** *"You're processing financial transactions. Lambda or Kappa?"*
> Depends on the regulatory model. If "the books are the batch result," Lambda — daily batch run is the source of truth, real-time signals are operational. If "the stream is authoritative" (e.g., transactional event sourcing with replay), Kappa with strong exactly-once. Many financial systems are pragmatic blends — Kappa for the live ledger, scheduled batch jobs for reconciliation reports because regulators expect daily snapshots.

---

## Related topics

- [Event-Driven Architecture](event-driven.md) — Kappa is event-driven at heart
- [Pipes and Filters](pipes-and-filters.md) — both Lambda and Kappa are pipeline architectures
- [CQRS + ES Architecture](cqrs-event-sourcing-architecture.md) — same replay semantics
- [Event Streaming](../messaging/event-streaming.md) — Kafka mechanics
- [Exactly-Once Semantics](../distributed/exactly-once.md) — what makes Kappa correct
- [Data Mesh](data-mesh.md) — organisational layer above these technical patterns
