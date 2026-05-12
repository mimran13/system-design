# Data Processing — Practical Examples

Scenarios involving large file ingestion, ETL pipelines, streaming aggregations, and search indexing. The common thread: **bytes flowing through stages**, where the right concepts depend on volume, latency tolerance, and fault behaviour.

---

## Scenario 1: User uploads 10GB CSV file for processing

**Concrete situation**: A fintech app lets enterprise customers upload accounting CSVs (10MB to 10GB). The system needs to validate, parse, and ingest each row into the database. Response time should be under 30 seconds for the *upload acknowledgement*, with processing happening async. Customer expects 99% of files processed within 5 minutes; 99.9% within 1 hour.

### Reasoning

- **You can't load 10GB into memory** — the application server will OOM.
- **You can't process synchronously** — HTTP timeouts, frustrated users.
- **You can't lose data** — financial files; loss = compliance issue.
- **You need progress visibility** — 30 minutes of "processing" with no feedback loses trust.
- The bottleneck is the **parse + validate + DB write** phase, not the upload itself.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Streaming](../messaging/event-streaming.md) | Process the file in chunks, never load whole file in memory |
| [Backpressure](../messaging/backpressure.md) | Slow DB writes shouldn't make us read the file faster than we can write |
| [Object Storage (S3)](../storage/blob-storage.md) | Upload directly to S3 with presigned URL; app server doesn't proxy 10GB |
| [Idempotency](../patterns/idempotency.md) | Re-processing must not double-insert rows on retry |
| [Outbox Pattern](../patterns/outbox.md) | DB write + "row processed" event in same transaction |
| [Async processing / queue](../messaging/message-queues.md) | Decouple upload from processing |

### Sketch

```
Client ──presigned PUT──► S3 (10GB upload bypassing app server)
   │
   └──POST /process { s3_key, idempotency_key } ──► API
                                                      │
                                                      ▼
                                                 SQS message
                                                      │
                                                      ▼
                                              Worker (long-running):
                                                read S3 object as STREAM
                                                ─► parse line-by-line (CSV reader)
                                                ─► validate batch of 1000 rows
                                                ─► write batch to Postgres in transaction
                                                ─► publish row_processed events
                                                ─► update progress counter in Redis
   ◄──poll progress──────────────────────────────────┘
```

### Trade-offs

- **What you gain**: bounded memory (a few MB even for 100GB files), recovery on worker crash (resume from offset), backpressure free (DB write is the natural rate-limiter)
- **What you give up**: complexity (multi-component pipeline), eventual consistency (rows appear gradually, not atomically)
- **Cost**: S3 storage + worker compute is cheaper than app server with 32GB RAM tier

### Anti-patterns to avoid

- ❌ Uploading through the application server (proxies 10GB through your code)
- ❌ Loading the file into memory: `data = file.read()` — OOM on big files
- ❌ Sync processing in the request — HTTP timeout, request retries cause double-processing
- ❌ One row, one DB transaction — 10M rows × 5ms = 14 hours
- ❌ Forgetting idempotency — worker retried after crash → duplicate rows

### Variations

- **Need real-time progress**: write progress to Redis every N rows; client polls or uses SSE
- **Need ordering**: use a single partition / single consumer in Kafka
- **File too big to process linearly**: split into chunks, process in parallel, reassemble (requires careful idempotency design)

---

## Scenario 2: Daily ETL — sync 10M rows from Postgres → analytics warehouse

**Concrete situation**: SaaS product has a Postgres database with users, orders, payments. Analytics team wants this data in Snowflake/BigQuery, refreshed daily. Schema changes occasionally. Some tables are 50GB.

### Reasoning

- **Full reload every day is wasteful** if 99% of rows didn't change.
- **Incremental load** needs a way to know "what changed since yesterday."
- **Schema changes** must propagate to the warehouse without manual intervention.
- **Latency requirement**: data fresh by 9 AM. Anything tighter (sub-hour) changes the architecture entirely.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Pipes and Filters](../architecture/pipes-and-filters.md) | Extract → Transform → Load; each stage independent |
| [Change Data Capture (CDC)](../patterns/event-sourcing.md) | Stream Postgres WAL → catch every change without full table scans |
| [Outbox Pattern](../patterns/outbox.md) | App-level alternative if CDC isn't available |
| [Data Warehousing](../storage/data-warehousing.md) | Columnar store optimised for analytics queries |
| [Lambda or Kappa architecture](../architecture/lambda-kappa-architectures.md) | Choice depends on latency needs |

### Sketch

```
Postgres (OLTP)
   │
   │ logical replication slot (pg_logical, Debezium)
   ▼
Kafka (per-table topics)
   │
   ├──► Stream processor (Flink / Spark Streaming)
   │      ─► dedupe, transform schema, enrich
   ▼
Iceberg / Delta Lake on S3 (lakehouse format)
   │
   ▼
Snowflake / BigQuery / Trino (read directly from lakehouse)
   │
   ▼
Analytics dashboards
```

### Trade-offs

- **What you gain**: near-real-time data (seconds-to-minutes lag), no impact on OLTP, schema changes propagate via Avro Schema Registry
- **What you give up**: complexity (Kafka + Flink + lakehouse), team needs to learn streaming
- **Cost**: ~$2-5K/month at this scale; replaces a $20K/year Fivetran-like tool

### Alternative for smaller scale

If you have 1M rows total and < 5GB data: **don't build CDC**. Use:

- `dbt` reading directly from Postgres replicas
- Daily snapshot via `pg_dump` to S3 → load to warehouse
- Fivetran / Airbyte (managed CDC)

The architecture above pays off at 100GB+ or when sub-hour freshness matters.

### Anti-patterns to avoid

- ❌ `SELECT * FROM users` daily on production Postgres (locks, bandwidth, hours of runtime)
- ❌ Last-modified timestamp filtering (`WHERE updated_at > yesterday`) — misses deletes; clock skew issues
- ❌ App-level dual writes (write to Postgres AND warehouse) — dual-write problem
- ❌ Building CDC from scratch — use Debezium, Conduit, or DMS

---

## Scenario 3: Real-time aggregation — count active users per minute

**Concrete situation**: A streaming product wants a dashboard showing active users (any user with activity in last 5 minutes), updated every 30 seconds. 500K events/sec at peak.

### Reasoning

- **Counting unique users** in a window is a streaming aggregation.
- **Exact count** at this scale is expensive (need to track every user ID seen in the window).
- **Approximate count** with HyperLogLog uses ~12KB to count millions of unique items with 1% error.
- **Sliding window** vs **tumbling window** matters for what "5-minute active" means.
- The dashboard is the consumer; it polls or subscribes.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Event Streaming (Kafka)](../messaging/event-streaming.md) | The 500K events/sec firehose |
| [Stream processing (Flink, Kafka Streams)](../messaging/event-streaming.md) | Stateful windowed aggregation |
| [HyperLogLog](../fundamentals/probabilistic-data-structures.md) | Approximate distinct count, tiny memory |
| [Backpressure](../messaging/backpressure.md) | Aggregator can't keep up with raw firehose? Need to slow producers or drop |
| [Pipes and Filters](../architecture/pipes-and-filters.md) | Events → window → aggregate → output |

### Sketch

```
500K events/sec ──► Kafka (user_activity topic, 50 partitions)
                                    │
                                    ▼
                         Flink job (per partition):
                           - 5-minute sliding window
                           - HyperLogLog per window
                           - emit (window_end, distinct_count) every 30s
                                    │
                                    ▼
                              Redis (latest count, TTL 5min)
                                    │
                                    ▼
                              Dashboard (poll every 30s, or SSE)
```

### Trade-offs

- **What you gain**: scales to billions of events; bounded memory per window; no DB hit per event
- **What you give up**: ~1% error on count (acceptable for "active users" metric), eventual consistency (30s lag)
- **Alternative**: write every event to Redis with TTL — works at <50K events/sec; doesn't scale further

### Anti-patterns to avoid

- ❌ Writing every event to Postgres → 500K writes/sec is impossible without sharding
- ❌ Exact count with `Set<UserId>` in memory → 1M users × 16 bytes/UUID = 16MB per window, scales linearly
- ❌ Querying "select distinct user_id from events where timestamp > now() - 5min" — full scan, slow, expensive
- ❌ No state persistence in stream processor → restart loses all in-flight windows

---

## Scenario 4: Indexing 100M product records into search

**Concrete situation**: E-commerce platform has 100M products in Postgres. Need them in Elasticsearch for search. New products and updates happen 10K/sec. Search must reflect changes within 60 seconds.

### Reasoning

- **Bulk initial load** of 100M records is one operation.
- **Ongoing sync** of changes is another, very different problem.
- **60-second freshness** rules out pure batch refresh.
- **Search index format** differs from OLTP schema (denormalised, full-text fields, faceted).

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Search Engines](../storage/search-engines.md) | Elasticsearch / OpenSearch / Meilisearch as the index store |
| [CQRS](../patterns/cqrs.md) | Postgres = write side; Elasticsearch = read side |
| [Outbox Pattern](../patterns/outbox.md) | Consistent dual-write between Postgres + ES |
| [Change Data Capture](../patterns/event-sourcing.md) | Capture every Postgres change → publish → index |
| [Event Streaming](../messaging/event-streaming.md) | Kafka topic decouples Postgres from ES indexer |

### Sketch

```
                            Initial bulk load (one-off):
                               pg_dump → script → bulk-index ES (using _bulk API)
                               Throttle to ~10K docs/sec; use index aliases for cutover

Ongoing:
Postgres ─► WAL ─► Debezium ─► Kafka (product_changes topic)
                                       │
                                       ▼
                               Indexer service (consumer):
                                 - read change event
                                 - look up full product (or use after-image)
                                 - transform to ES doc shape
                                 - index in ES (bulk every 1s or 1000 docs)
                                       │
                                       ▼
                                 Elasticsearch
                                       ▲
                                       │
                                  search API ◄── client
```

### Trade-offs

- **What you gain**: search is fast and rich (facets, fuzzy match, ranking); decoupled from Postgres performance
- **What you give up**: eventual consistency (search may show stale data for ~1-60 seconds after write); operational complexity (ES is its own beast)
- **Cost**: ES cluster for 100M docs ~ $1-3K/month on AWS depending on instance class

### Anti-patterns to avoid

- ❌ App writes to both Postgres and ES synchronously → dual-write problem; one fails, the other doesn't
- ❌ Cron job re-indexes everything every 5 minutes → tons of CPU; doesn't scale
- ❌ Writing search-shaped documents in Postgres directly — Postgres full-text search is OK for small sets, doesn't beat ES at 100M
- ❌ Skipping Kafka, having Debezium write directly to ES → no replay if ES is down for an hour

---

## Common pitfalls across all data-processing scenarios

| Pitfall | Mitigation |
|---|---|
| Out-of-memory on large inputs | Stream, don't load |
| One slow stage pegging the whole pipeline | Backpressure or queue with bounded depth |
| Failed worker re-processes from start | Checkpoint progress; resumable workers |
| Out-of-order events causing wrong aggregates | Event-time processing with watermarks |
| Schema change breaks downstream | Schema registry (Avro / Protobuf) with compatibility rules |
| Pipeline silently drops data | Audit counters end-to-end; reconciliation job |

---

## Related

- [Pipes and Filters Architecture](../architecture/pipes-and-filters.md)
- [Event Streaming](../messaging/event-streaming.md)
- [Lambda & Kappa Architectures](../architecture/lambda-kappa-architectures.md)
- [Backpressure](../messaging/backpressure.md)
- [Outbox Pattern](../patterns/outbox.md)
