---
tags:
  - interview-critical
  - for-scale
---

# Sharding

!!! tip "Applied companions"
    For **how to query** after sharding (routing, scatter-gather, secondary indexes, cross-shard JOINs), see **[Querying Sharded Data](querying-sharded-data.md)**. For the operational playbook (shard key selection, resharding, observability), see **[Sharding Best Practices](sharding-best-practices.md)**.

## What it is

Sharding (horizontal partitioning) splits a database into multiple independent pieces called shards, each storing a subset of the data. Unlike replication (copies of the same data), each shard holds unique data.

## You'll see this when...

- Single Postgres / MySQL is at 80% capacity, growing — vertical scale running out
- One table is 90% of the database size — needs its own shard
- Database CPU pegged but queries are fine; pure throughput limit
- Multi-tenant SaaS: one tenant's data drowns the rest
- Vitess, Citus, or custom shard router in the stack
- DynamoDB partition key choice debates ("how do we avoid hot partitions?")
- "Shard key" appears anywhere in the schema or routing logic
- Need to keep tenant data per-region (regulatory) — sharding by region

```
Without sharding:
  All users → Single DB server → Bottleneck at ~10TB / ~10K write QPS

With sharding (4 shards):
  Users 0-25M   → Shard 1
  Users 25-50M  → Shard 2
  Users 50-75M  → Shard 3
  Users 75-100M → Shard 4
  
  Each shard: smaller, faster, independently scalable
```

## Sharding strategies

### Hash sharding (range of hash values)

```python
shard_id = hash(user_id) % num_shards

user_id=1001 → hash(1001) % 4 = 2 → Shard 2
user_id=1002 → hash(1002) % 4 = 1 → Shard 1
```

**Pros:** Even distribution, no hot shards  
**Cons:** Range queries span all shards, resharding requires moving ~all data

### Range sharding

```
Shard 1: user_id 1 → 25,000,000
Shard 2: user_id 25,000,001 → 50,000,000
Shard 3: user_id 50,000,001 → 75,000,000
Shard 4: user_id 75,000,001 → 100,000,000
```

**Pros:** Range queries efficient within a shard, easy to add shards at the boundary  
**Cons:** Hot shards if range is uneven (new users all go to last shard), requires upfront planning

**Hot shard problem:**
```
Users sign up sequentially → all new users go to Shard 4
Shard 4: 80% of write load
Shards 1-3: mostly reads
```

Fix: use `created_at` as shard key only if write load is uniform over time.

### Directory-based sharding

A lookup service maps each key to a shard:

```
Shard Directory:
  user_id 1001 → Shard 2
  user_id 1002 → Shard 1
  ...

App → query directory → route to correct shard
```

**Pros:** Most flexible — can move data between shards without rehashing  
**Cons:** Directory is a single point of failure (must be highly available), adds latency

### Consistent hash sharding

See [Consistent Hashing](consistent-hashing.md). Minimal data movement when adding/removing shards.

**Used by:** MongoDB, Cassandra, DynamoDB, Redis Cluster.

## Shard key selection

The most critical decision. A bad shard key creates hot shards and ruins the benefits of sharding.

**Good shard key properties:**
1. **High cardinality:** Many possible values (user_id good, status="active/inactive" terrible)
2. **Even distribution:** Values spread uniformly (not all writes going to recent timestamps)
3. **Matches access pattern:** Most queries filter by this key (avoid cross-shard queries)
4. **Immutable:** Don't use a key that changes (would require moving the record)

**Anti-patterns:**

| Shard key | Problem |
|---|---|
| `status` | Only 2-3 values → hot shard |
| `created_at` | All new records go to one shard |
| `country` (uneven users) | US shard 10x larger than others |
| `email prefix` | Skewed distribution (more a-f than x-z) |

**Good patterns:**

| Use case | Shard key | Why |
|---|---|---|
| User data | `user_id` | High cardinality, even, immutable |
| Messages | `(conversation_id, time bucket)` | Locality + bounded partition size |
| Orders | `user_id` (not order_id) | Keep user's orders on same shard for queries |
| IoT sensor data | `(device_id, date)` | Bounded size, device locality |

## Cross-shard queries

The hardest problem with sharding. A query that needs data from multiple shards:

```sql
-- Which shard does this go to?
SELECT * FROM users WHERE country = 'US'  -- users on ALL shards
SELECT COUNT(*) FROM orders               -- need all shards
JOIN users ON orders.user_id = users.id   -- might span shards
```

**Solutions:**

**Scatter-gather:** Query all shards in parallel, merge results at application level:
```python
results = []
for shard in all_shards:
    results.extend(shard.query("SELECT * FROM users WHERE country='US'"))
return sorted(results, key=lambda u: u.created_at)
```
Expensive — all shards queried.

**Denormalize:** Store data needed for common queries together (avoid cross-shard join):
```
Instead of JOIN users + orders:
  Embed user_name in orders table
  Now orders query doesn't need users shard
```

**Separate analytics DB:** Run cross-shard analytical queries against a replica aggregated into a data warehouse, not the primary shards.

**Non-shard-key lookup:** Build a separate index for secondary lookups:
```
Primary: users sharded by user_id
Secondary index: email → user_id (lookup in separate lookup table or Elasticsearch)

Query by email:
  1. Lookup user_id from index (separate service)
  2. Route to correct shard using user_id
```

## Resharding

Adding shards is painful. Plan ahead.

**Online resharding:**
```
Current: 4 shards
Target:  8 shards

1. Create 8 new empty shards
2. Double-write: all new writes go to both old and new sharding scheme
3. Backfill: copy existing data to new shards
4. Switch reads to new shards
5. Stop double-writes
6. Drop old shards
```

**Minimize resharding need:**
- Start with more shards than needed (e.g., 256 virtual shards on 4 physical nodes)
- When adding nodes, move virtual shards rather than rehashing all data

## Hotspot mitigation

When a single shard receives disproportionate load:

**Cause 1: Hot key** (one user generating enormous traffic)
```
Solution: split the hot record across shards
  user_id=1001 → normally 1 shard
  Viral user_id=1001 → randomly append suffix: "1001:0", "1001:1", ..., "1001:9"
  Writes distributed across 10 virtual keys
  Reads: fan-out to all 10, aggregate
```

**Cause 2: Time-based hot shard** (all new data on same shard)
```
Solution: distribute time-based data with hash prefix
  Instead of: created_at → always latest shard
  Use: hash(created_at + random_salt) → distribute new data
```

## AWS sharding

**DynamoDB:**
- Built-in sharding via partition key
- Up to 10 MB/s write per partition key value (request adaptive capacity)
- Design partition key to avoid hotspots

**Aurora:**
- No built-in sharding (it's relational)
- Use application-level sharding
- Or use Vitess (PlanetScale) as sharding proxy

**Cassandra (Amazon Keyspaces):**
- Consistent hash-based sharding built in
- Partition key is your shard key

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you design a shard key thoughtfully — not just say "we'll shard the database."

**Strong answer pattern:**
1. Identify the scale that requires sharding (> ~10TB or > ~10K write QPS)
2. Choose shard key based on access patterns — what does every query filter on?
3. Show you thought about hot shards — how do you ensure even distribution?
4. Explain cross-shard query strategy
5. Mention starting with more virtual shards than physical nodes for easier resharding

## Related topics

- [Consistent Hashing](consistent-hashing.md) — minimizing data movement on resharding
- [Replication](replication.md) — sharding + replication = fault tolerance + scale
- [SQL vs NoSQL](../storage/sql-vs-nosql.md) — when sharding requirement drives to NoSQL
- [Wide-Column Stores](../storage/wide-column-stores.md) — Cassandra's built-in sharding
