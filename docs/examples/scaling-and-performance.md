# Scaling & Performance — Practical Examples

Scenarios where the bottleneck is **throughput, latency, or both**. The common thread: **identify what serialises, then unserialise it** — via caching, sharding, async, or specialised storage.

---

## Scenario 1: Hot key in Redis cache — one entry serves 60% of traffic

**Concrete situation**: A trending content feed has one key `trending:global` that 60% of all reads hit. Single Redis primary holding this key is at 80% CPU; reads slow.

### Reasoning

- **Single key = single shard = single CPU**. Adding more Redis nodes doesn't help one key.
- Three approaches, mix-and-match:
  - **Replicate the hot key** to multiple Redis nodes; clients pick a random one
  - **Cache locally** in each app server (with short TTL)
  - **Salt the key** into N variants (less applicable here since "trending" is one logical thing)
- **The actual fix**: serve trending from app-server local cache with 30s TTL; one Redis primary refreshes the source.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Hot Partitions & Hotspots](../fundamentals/hot-partitions.md) | The diagnostic |
| [Caching Strategies](../caching/caching-strategies.md) | Multi-layer cache (app-local + Redis) |
| [Distributed Caching](../caching/distributed-caching.md) | Redis as L2; app server as L1 |
| [Cache Patterns & Pitfalls](../caching/cache-patterns.md) | Cache stampede risk on TTL expiry |

### Sketch

```
Without fix:
  All 200 app servers ──► Redis primary (1 key:trending:global)
  Redis CPU pegged

With fix:
  Each app server: in-process LRU cache (libcache, caffeine)
    - cache "trending:global" for 30s
  On miss:
    - SINGLE_FLIGHT lock prevents stampede
    - one server queries Redis; others wait
    - response cached in app memory
  Redis QPS drops 99% (only 200 servers × 1 req per 30s = 6.6 req/s)
```

### Trade-offs

- **What you gain**: ~99% reduction in Redis load on hot key; sub-millisecond latency from app memory
- **What you give up**: up to 30s stale data; complexity of cache hierarchy; per-server cache pollution if many hot keys
- **Cost**: free — uses existing memory in app servers

### Anti-patterns to avoid

- ❌ Sharding the trending key by user ID → not the real partitioning axis (everyone wants same trending list)
- ❌ Putting trending in Postgres directly → DB hits worse than cache hits
- ❌ Polling cache aggressively (every 1s per server) → defeats the cache
- ❌ No SINGLE_FLIGHT → 200 servers all rebuild on TTL expiry → DB hammered

### Variations

- **User-scoped trending** ("trending in your city"): salt by city → no longer one hot key
- **Hot key on writes** (counter): write-batched aggregation, not cache
- **Hot key in DynamoDB**: enable adaptive capacity; consider write-sharding the key

---

## Scenario 2: 100K writes/sec to a single Postgres table

**Concrete situation**: Activity-tracking service (clicks, views) needs to record 100K events/sec. Currently writing each event to Postgres `events` table — table is 200 GB, indexes slow, vacuum lags.

### Reasoning

- **Postgres tops out at ~20-50K simple writes/sec** on big hardware.
- **Time-series workloads** don't fit OLTP databases well — wrong access pattern.
- The real answer is **specialised store or specialised approach**:
  - **Time-series DB** (TimescaleDB, ClickHouse, InfluxDB)
  - **Append-only log** (Kafka) → batch into warehouse
  - **Aggregate before writing** — most "100K events/sec" is "I want to count, not store every event"

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Time-Series Databases](../storage/time-series-databases.md) | Purpose-built for this access pattern |
| [Hot Partitions](../fundamentals/hot-partitions.md) | If sharding, sequential timestamp keys → all writes hit one shard |
| [Event Streaming (Kafka)](../messaging/event-streaming.md) | Buffer + batch into warehouse |
| [LSM-tree storage](../fundamentals/storage-internals.md) | Why Cassandra/RocksDB write fast |
| [CQRS](../patterns/cqrs.md) | Write to fast store; read aggregations from another |

### Sketch

```
Option A: TSDB direct
  Client → ClickHouse (or TimescaleDB) → fast columnar writes

Option B: Kafka-buffered (when reads are aggregations)
  Client → Kafka events topic (100K msg/s easy)
                ├─► Real-time agg (Flink): per-minute counts → Redis
                └─► Hourly batch: ClickHouse / S3+Athena

Option C: Aggregate-before-write
  Client batches 100 events client-side, sends 1 batched insert
  Server batches across requests with ~100ms window
  Inserts to Postgres in batches of 1000
  Postgres now sees ~1K writes/sec, manageable
```

### Trade-offs

- **What you gain**: orders of magnitude more write throughput; queries that fit the workload (time-range, aggregates)
- **What you give up**: another store to operate; eventual consistency between event ingestion and reportable state
- **Cost**: ClickHouse on managed services ~$500-2K/month; self-hosted on EC2 ~$100/month for small scale

### Anti-patterns to avoid

- ❌ Adding more Postgres replicas → replicas don't help write scaling
- ❌ Sharding `events` by `event_id` → time-ordered ID = sequential = all writes to last shard (hot)
- ❌ Inserting one row at a time over the network → ~5ms each × 100K/s = need 500 connections
- ❌ Fancy ML on every event in real-time before insert → kills throughput

---

## Scenario 3: Social media timeline — Twitter-style fan-out

**Concrete situation**: 100M users; some have 100M followers (celebrities), most have <500. When a user posts, their followers should see it in their timeline within seconds. Read load: each user opens timeline ~50 times/day = 5B reads/day.

### Reasoning

- **Push (fan-out on write)**: when alice posts, write the post to all 500 of her followers' timelines. Fast reads, slow writes for popular users.
- **Pull (fan-out on read)**: when bob opens his timeline, query "what did everyone bob follows post recently?" → JOIN/lookup. Fast writes, slow reads.
- **Hybrid**: push for most users; pull for celebrities (avoid 100M-row write per tweet).
- **Caching the timeline** (Redis sorted set per user) is the standard trick — push or precompute keeps it fast.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Hot Partitions](../fundamentals/hot-partitions.md) | Celebrity = hot user; can't fan-out 100M writes per tweet |
| [Caching Strategies](../caching/caching-strategies.md) | Per-user timeline cache (Redis sorted set) |
| [CQRS](../patterns/cqrs.md) | Tweets table (write) vs timeline cache (read) |
| [Event Streaming](../messaging/event-streaming.md) | Tweet event → fan-out workers consume → write to per-user timelines |
| [Sharding](../patterns/sharding.md) | Partition tweets by user_id; partition timeline cache by user_id |

### Sketch

```
User posts a tweet:
  POST /tweets ──► tweets table (Cassandra, partitioned by user_id)
                           │
                           ▼
                    publish TweetCreated event to Kafka

Fan-out worker (consumes TweetCreated):
  IF user is celebrity (followers > 1M):
    DO NOTHING — timeline served via pull
  ELSE:
    fetch follower list (paged, 1000 at a time)
    for each follower: ZADD timeline:{follower_id} {tweet_id} score=timestamp
    (Redis sorted set; cap at last 1000 tweets per timeline)

Reading timeline:
  GET /timeline ──► API:
    1. Read precomputed timeline: ZREVRANGE timeline:{user_id} 0 99 (Redis)
    2. For users following celebrities: 
         fetch celebrity tweets directly from tweets table
         merge with precomputed timeline
    3. Hydrate tweet content (tweets table) — usually cached
    4. Return
```

### Trade-offs

- **What you gain**: fast timeline reads (single Redis lookup); scales to billions
- **What you give up**: write amplification (one tweet = N writes for N followers); celebrities require special path; ~3-4 storage systems involved
- **Cost**: Redis at this scale is the dominant infrastructure cost; ~$100K+/month

### Anti-patterns to avoid

- ❌ Pure pull at scale: timeline = `SELECT * FROM tweets WHERE user_id IN (followees) ORDER BY created_at LIMIT 100` → terrible at 1000 followees and millions of tweets each
- ❌ Pure push for celebrities: 100M-row write on every tweet, hammers everything
- ❌ One giant `timeline` table → write hot spot, read hot spot
- ❌ No cap on timeline size → memory blows up

---

## Scenario 4: Search across 1B documents with sub-100ms p99

**Concrete situation**: Marketplace with 1B product listings. Users expect search results in <100ms. Filters by category, price, location. New listings every second; updates frequent.

### Reasoning

- **Postgres full-text search** caps out around 1-10M docs.
- **Elasticsearch / OpenSearch** is the de-facto answer for this scale.
- **Indexing strategy** matters: shard count, replica count, index time vs query time analysis.
- **Caching** at multiple layers: query cache, document cache, CDN for popular searches.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Search Engines](../storage/search-engines.md) | The right tool |
| [Sharding](../patterns/sharding.md) | Shard ES index across N nodes |
| [Replication](../patterns/replication.md) | Replicas for read scaling |
| [Caching Strategies](../caching/caching-strategies.md) | Cache popular queries |
| [CQRS](../patterns/cqrs.md) | Postgres write, ES read |
| [Outbox + CDC](../patterns/outbox.md) | Postgres → ES sync without dual-write |

### Sketch

```
Write path:
  POST /listing → Postgres (source of truth) + outbox event
  Debezium → Kafka → ES indexer service
  Indexer batches docs (1000 at a time) → ES bulk index API
  ~10s lag from write to searchable

Read path:
  GET /search?q=...&filters=... 
    → API → ES cluster (50 shards × 2 replicas)
    → ES returns top-K matches
    → API hydrates with latest data from Postgres / Redis cache
    → return (typical: 30-50ms)

Caching:
  - Redis cache for most popular query strings (TTL 30s)
  - CDN for full search response on common queries (rare; usually personalised)
  - Document cache in app for hot products
```

### Trade-offs

- **What you gain**: sub-100ms p99 at 1B docs; rich features (faceting, fuzzy, ranking)
- **What you give up**: eventual consistency between Postgres and ES; ES operational overhead; expensive ($50-200K/month at this scale)
- **Alternative**: Algolia / Meilisearch managed (faster to set up, eventually expensive)

### Anti-patterns to avoid

- ❌ Postgres `WHERE name LIKE '%query%'` at 1B docs → seq scan
- ❌ Single large ES index, no sharding → can't scale beyond one node's RAM
- ❌ Direct dual-write app → Postgres + ES → drift between them
- ❌ Re-indexing whole dataset on every update → minutes-hours of indexing
- ❌ One query cache key per user → tiny hit rate; cache by query+filters, not user

---

## Common pitfalls across scaling scenarios

| Pitfall | Mitigation |
|---|---|
| Adding nodes doesn't help — bottleneck is one component | Find what serialises; that's the constraint |
| Cache hit rate <90% under load | Working set > cache size; bigger cache or smarter eviction |
| Database CPU pegged but queries look simple | Missing index, or N+1, or seq scans |
| Tail latency (p99) is 10× p50 | Fan-out amplification; consider hedged requests |
| Throughput plateaus at 70% of one machine's capacity | Hitting Amdahl's / USL ceiling; can't scale further on this design |
| One slow request blocks others | No bulkhead; share thread pool with everyone |

---

## Related

- [Hot Partitions & Hotspots](../fundamentals/hot-partitions.md)
- [Throughput Limits](../fundamentals/throughput-limits.md)
- [Caching Strategies](../caching/caching-strategies.md)
- [Sharding](../patterns/sharding.md)
- [CQRS](../patterns/cqrs.md)
- [Time-Series Databases](../storage/time-series-databases.md)
