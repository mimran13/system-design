---
tags:
  - for-scale
  - applied
---

# Hot Partitions & Hotspots

Sharding spreads load across N nodes. Hot partitions destroy that promise: one shard receives 50% of traffic while the others sit idle. The system's effective capacity collapses to one shard. This page covers why hotspots happen, how to detect them, and the mitigation patterns.

---

## You'll see this when...

- Cluster shows "20% utilisation" but one shard is at 100%
- DynamoDB throttling errors despite low overall RCU/WCU usage
- One celebrity user (Twitter, social) generates more load than the rest combined
- Cassandra "wide row" warnings; one partition holds millions of rows
- Time-series data: every write hits "today's" partition, others idle
- Redis MONITOR shows one key dominating ops/sec
- AWS DynamoDB "Adaptive Capacity" warnings in console
- Black Friday: one product's page generates 50% of all reads

---

## What a hot partition looks like

```
Load distribution across 100 shards:
  Shard 0:  50%   ← hot
  Shard 1:  10%
  Shard 2:  5%
  Shards 3-99: <1% each
  
Effective capacity: limited by Shard 0
Other 99 shards underutilised
```

Throughput is bounded by the busiest partition, not the average. Even at "20% cluster utilisation," the cluster can be at 100% on one shard and useless.

---

## Why hotspots happen

### 1. Skewed access patterns

Some keys are inherently more popular:

```
Twitter: a few celebrities have millions of followers
E-commerce: 5% of products generate 80% of traffic (Pareto)
News: hot stories spike to 100× normal
DNS: some domains queried much more than others
Gaming: one popular game fills servers
```

The data is partitioned by ID; popular IDs concentrate load.

### 2. Sequential keys

If you partition by a monotonically increasing key (timestamp, auto-increment ID), all writes go to the latest partition.

```
Partition by hour:
  2026-05-09-13:00 partition  ← all current writes go here
  2026-05-09-12:00 partition  ← idle
  2026-05-09-11:00 partition  ← idle
```

Time-series databases face this naturally; they mitigate via sub-sharding by metric name + time.

### 3. Bad partition keys

A poorly chosen partition key concentrates similar workloads:

```
Partition by country:
  US partition: 70% of traffic
  Other partitions: 30% combined
```

Or partitioning by a low-cardinality field:

```
Partition by status (active/inactive):
  2 partitions, can't scale to 100 nodes
```

### 4. Tenant skew (multi-tenant)

Most users tiny, a few enormous:

```
Tenant 1:    10 GB data
Tenant 2:    100 MB data
Tenant 3:    50 MB data
...
Tenant N:    1 KB data

Tenant 1's shard: oversized; others: barely used
```

### 5. Application bugs

```
Bug: every request looks up the same metadata key
  → 100% of requests hit cache key "config"
  → "config" key's shard is the bottleneck
```

Surprisingly common — accidental hot keys from:

- Singleton config / metadata reads
- Default user / fallback flows
- Specific endpoints that bypass caching

---

## Detection

### Per-shard metrics

```
shard_0_qps      450
shard_1_qps      8
shard_2_qps      12
shard_3_qps      15
...
```

Alert on coefficient of variation across shards. A healthy cluster has CV < 0.5. CV > 1 means severe skew.

### Top-K key tracking

Sample keys at the proxy / cache / database; identify the keys generating most load:

```
Top 10 keys by request count (last 5 min):
  user:12345           1.2M requests   ← hot
  config:global        800K requests   ← hot
  user:67890           50K requests
  ...
```

Tools: Redis `MONITOR` (debug only), Datadog real user monitoring, custom samplers, eBPF.

### Latency variance

Hot shards show higher P99 latency. Compare per-shard P99:

```
shard_0_p99      500 ms   ← hot, contention
shard_1_p99      20 ms
shard_2_p99      15 ms
```

---

## Mitigations

### 1. Better partition key

The cheapest fix: pick a key with high cardinality and uniform distribution.

```
Bad: country
Good: hash(user_id)
Excellent: hash(user_id + bucket_id)  -- multi-level
```

Hash functions destroy ordering but spread load.

### 2. Salting / random suffixing

Append a random or hashed suffix to "split" a hot key into N virtual keys:

```
Hot key:  "trending:topic:elections"
Split into: "trending:topic:elections:0"
            "trending:topic:elections:1"
            ...
            "trending:topic:elections:9"

Writers: pick random suffix, write
Readers: read all 10 and combine
```

Each suffix lands on a different shard. Trade: read cost is N× now.

### 3. Hot key replication

Replicate hot keys to multiple nodes; readers pick a random replica:

```
Normal key:  one primary
Hot key:     replicated to 5 nodes; each read picks one
```

Requires the system to detect "hot" and dynamically replicate. DynamoDB does adaptive capacity automatically.

### 4. Caching the hot key

If reads dominate, cache the hot key at every consumer:

```
Service caches hot config locally
Refreshes every 5 seconds
Database serves only refresh requests, not every read
```

Reduces database load by ~99% for read-heavy hot keys.

### 5. Aggregation layer

For writes: aggregate before persisting:

```
1M increments to counter:foo
  → aggregate in memory
  → flush 1 update per second to database
```

Trade: lose individual increment fidelity (but only for the aggregate). Used in analytics, view counters, voting.

### 6. Virtual shards (consistent hashing with virtual nodes)

Each physical node owns many ring positions:

```
Node A owns ring positions: 0x10, 0x4F, 0x8A, ...
Node B owns ring positions: 0x25, 0x6C, 0x91, ...
```

Spreads load more evenly than one position per node. Standard in Cassandra, DynamoDB.

See [Consistent Hashing](../patterns/consistent-hashing.md).

### 7. Adaptive partitioning

The system splits hot partitions automatically:

```
Detect: shard X is at 90% utilisation
Split: partition X into X1 and X2
Migrate: half the keys to X2
```

DynamoDB calls this "adaptive capacity" + "auto-split." Cassandra has token range splits.

### 8. Tenant separation

Move giant tenants to dedicated shards:

```
Tenant 1 (1 TB): own dedicated shard
Tenants 2-1000: shared multi-tenant shard
```

Used in SaaS — "noisy neighbour" mitigation. See [Multi-Tenancy](../architecture/multi-tenancy.md).

---

## When hotspots are inevitable

Some workloads have legitimate concentration that you can't shard away:

- Live event traffic (Super Bowl, product launch)
- Single-tenant heavy workloads (one customer, must serve them)
- Inherent global state (configuration, leader election)

For these:

- **Vertical scaling**: bigger box for that one shard
- **Caching heavily**: insulate the shard
- **Read replicas**: scale reads independently
- **Asynchronous processing**: queue, don't block on the hotspot
- **Graceful degradation**: rate-limit fairly when hot

---

## Examples

### Twitter timeline

A celebrity follower lookup is a hot key:

```
"followers of @bigcelebrity" → 100M followers
Single key, single shard
```

Mitigation: shard the followers table by `(celebrity_id, follower_shard)` so different shards hold different slices of followers; queries fan out and merge.

### Cache stampede on a hot config

```
1M servers all read "current_config" key from Redis
Redis: hot key, becoming bottleneck
```

Mitigation: each server caches locally; refreshes from Redis every N seconds.

### Time-series database write hotspot

All writes go to "today's" shard.

Mitigation: shard by `(metric_name, time_bucket)` — different metrics land on different shards even at the same time.

### DynamoDB GSI hotspot

A GSI partition key with low cardinality:

```
GSI partition key: status (only "active" or "inactive")
"active" partition: 99% of items, 99% of queries
```

Mitigation: write-sharding the GSI key:

```
status_shard = status + ":" + (item_id % 10)
"active:0", "active:1", ..., "active:9"
```

10 partitions instead of 2; queries fan out.

---

## Detection in real time

```yaml
alerts:
  - name: PartitionHotspot
    condition: |
      max(shard_qps) / avg(shard_qps) > 5
      AND max(shard_qps) > 1000
    duration: 5m
    severity: warning
    
  - name: ShardLatencyImbalance
    condition: |
      max(shard_p99) / avg(shard_p99) > 3
    severity: warning
```

Some systems (DynamoDB, CockroachDB) expose hot partition warnings directly.

---

## Tradeoffs

| Mitigation | Cost |
|---|---|
| Better key | Migration / data layout change |
| Salting | Read amplification (N× reads to merge) |
| Replication | Memory cost; eventual consistency on writes |
| Caching | Stale data window; cache invalidation |
| Aggregation | Loss of individual fidelity |
| Adaptive split | Migration overhead during split |
| Tenant separation | Operational complexity per tenant |

Pick based on the specific failure mode — there's no universal fix.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you anticipate hotspots in the design phase, not just react to them in production.

**Strong answer pattern:**
1. Even partitioning ≠ even load; popular keys concentrate
2. Detect via per-shard metrics, top-K key tracking, latency variance
3. Mitigate by partition key choice, salting, replication, caching, aggregation
4. Some hotspots are unavoidable — vertical scale and graceful degradation
5. Plan for multi-tenant skew — giant tenants get dedicated shards

**Common follow-up:** *"You're designing a 'top trending' page. What's the hotspot risk?"*
> The trending list itself is a hot key — every user reads it. Mitigation: cache aggressively (every server, every CDN edge), refresh asynchronously, treat it as eventually consistent. The data feeding the trending list (raw events) might also have hotspots if one event explodes; mitigate via salting on the write side and aggregation. Don't try to update a single "trending counter" row in your database — that's a guaranteed contention point.

---

## Related topics

- [Sharding](../patterns/sharding.md) — partitioning strategies
- [Consistent Hashing](../patterns/consistent-hashing.md) — virtual nodes for even distribution
- [Throughput Limits](throughput-limits.md) — Amdahl/USL on coordination cost
- [Caching Strategies](../caching/caching-strategies.md) — caching hot keys
- [Multi-Tenancy](../architecture/multi-tenancy.md) — noisy neighbour mitigation
