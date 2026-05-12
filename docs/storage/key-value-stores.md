# Key-Value Stores

## What it is

A key-value store is the simplest NoSQL model: a dictionary at scale. You store and retrieve values by their key. No schema, no joins, no complex queries — just `SET key value` and `GET key`.

## Data model

```
Key (string)    → Value (bytes / string / structured)
─────────────────────────────────────────────────────
"user:1001"     → { "name": "Alice", "email": "alice@example.com" }
"session:abc"   → "user_id=1001&expires=1714000000"
"counter:views" → "483921"
"rate:ip:1.2.3.4:2024-04-26-14" → "47"
```

Values are opaque bytes to the DB — it doesn't parse them (unless the system has typed values like Redis).

## Redis

The dominant in-memory key-value store. Redis goes beyond plain KV — it has typed data structures that make it a Swiss Army knife for backend systems.

### Data structures

**String** — atomic counter, cached value, session token
```
SET user:1001:name "Alice"
INCR page:views → 1, 2, 3 ... (atomic increment)
SETNX lock:order:99 1 EX 30  → set-if-not-exists with TTL (distributed lock)
```

**Hash** — object with multiple fields (efficient for partial updates)
```
HSET user:1001 name "Alice" email "alice@example.com" age 30
HGET user:1001 name → "Alice"
HINCRBY user:1001 age 1
```

**List** — ordered collection, supports push/pop from both ends (queue, stack, feed)
```
RPUSH feed:1001 post:500 post:501 post:502
LRANGE feed:1001 0 9 → last 10 posts (paginated feed)
BLPOP queue:jobs 30  → blocking pop (task queue with 30s timeout)
```

**Set** — unordered unique members (tags, unique visitors, mutual friends)
```
SADD user:1001:tags "python" "redis" "backend"
SISMEMBER user:1001:tags "redis" → 1
SINTER user:1001:tags user:2002:tags → common tags (mutual interests)
```

**Sorted Set (ZSet)** — set with a float score; ordered by score
```
ZADD leaderboard 4820 "alice" 3100 "bob" 5900 "carol"
ZRANGE leaderboard 0 2 WITHSCORES REV → top 3 by score
ZRANK leaderboard "alice" → 1 (0-indexed rank)
```

**Stream** — append-only log, consumer groups (like Kafka lite)
```
XADD events * event "page_view" user "alice" page "/home"
XREAD COUNT 10 STREAMS events 0
```

**HyperLogLog** — probabilistic cardinality counting (~2% error, 12KB regardless of set size)
```
PFADD unique_visitors:today user:1001 user:2002 user:3003
PFCOUNT unique_visitors:today → ~3
```

**Bloom Filter** (Redis Stack) — probabilistic membership test
```
BF.ADD blocked_emails "spam@example.com"
BF.EXISTS blocked_emails "spam@example.com" → 1 (may be false positive)
BF.EXISTS blocked_emails "alice@example.com" → 0 (definitely not a member)
```

### Redis persistence

| Mode | Mechanism | Data loss risk | Performance impact |
|---|---|---|---|
| No persistence | Memory only | All data lost on restart | None |
| RDB (snapshot) | Fork + write snapshot every N seconds | Up to N seconds of writes | Low (fork overhead) |
| AOF (append-only file) | Log every write command | Near-zero (fsync options) | Higher |
| RDB + AOF | Both | Near-zero | Moderate |

```
# redis.conf
save 900 1        # RDB snapshot if 1 key changed in 900s
appendonly yes    # Enable AOF
appendfsync everysec  # fsync every second (good balance)
```

### Redis Cluster

Horizontal sharding built in. Data is distributed across nodes using consistent hashing with 16,384 hash slots.

```
Node 1: slots 0–5460
Node 2: slots 5461–10922
Node 3: slots 10923–16383

Key "user:1001" → CRC16("user:1001") % 16384 = slot 3267 → Node 1
```

Each node has replicas. Client connects to any node — redirected via `MOVED` if needed.

### Redis use cases

| Use case | Data structure | Pattern |
|---|---|---|
| Session store | String / Hash | `SET session:{token} {data} EX 3600` |
| Distributed cache | String / Hash | Cache-aside with TTL |
| Rate limiting | String | `INCR + EXPIRE` or Sorted Set sliding window |
| Distributed lock | String | `SET key 1 NX EX timeout` (Redlock for multi-node) |
| Leaderboard | Sorted Set | `ZADD + ZRANGE` |
| Pub/Sub | — | `PUBLISH channel msg` / `SUBSCRIBE channel` |
| Job queue | List | `RPUSH + BLPOP` or Redis Streams |
| Unique visitors | HyperLogLog | `PFADD + PFCOUNT` |
| Feature flags | Hash | `HSET flags feature_x enabled` |

## DynamoDB

AWS's fully managed key-value and document store. Designed for single-digit millisecond latency at any scale.

### Data model

```
Table: users
  Partition Key (PK): user_id   ← hash key, determines shard
  Sort Key (SK):      email     ← optional, enables range queries within partition

Item: {
  "user_id": "u-1001",         ← PK
  "email": "alice@example.com", ← SK
  "name": "Alice",
  "created_at": "2024-01-15"
}
```

**Partition key design is critical:** DynamoDB distributes data across partitions by PK. A hot PK (e.g., all writes to `user_id = "admin"`) creates a hot partition and throttles.

### Access patterns

DynamoDB is **access-pattern driven**. Design your table around how you query, not around your data model.

```python
# Primary key lookup (fastest)
table.get_item(Key={'user_id': 'u-1001', 'email': 'alice@example.com'})

# Query within partition (sorted by SK)
table.query(
    KeyConditionExpression=Key('user_id').eq('u-1001') &
                           Key('created_at').between('2024-01-01', '2024-12-31')
)

# Scan (avoid — reads entire table)
table.scan(FilterExpression=Attr('status').eq('active'))
```

### Global Secondary Indexes (GSI)

Allows querying by attributes other than the primary key. GSI has its own PK + SK, projecting a subset of columns.

```
GSI: email-index
  PK: email
  SK: created_at

Query: "find user by email"
  → query email-index instead of scanning table
```

**Sparse index pattern:** Only items with the GSI's PK attribute are included. If `status = 'pending'` is only on pending orders, a GSI on `status` is sparse — efficient for querying the small subset.

### DynamoDB streams + CDC

Every write to a DynamoDB table can emit a stream event (INSERT/MODIFY/REMOVE). Lambda can process these in real-time for:
- Invalidating caches
- Sending notifications
- Replicating to other stores (Elasticsearch, Redshift)

### DynamoDB vs Redis

| | Redis | DynamoDB |
|---|---|---|
| **Latency** | Sub-millisecond | Single-digit ms (μs with DAX) |
| **Persistence** | Optional | Always (fully durable) |
| **Scale** | Manual cluster setup | Fully managed, auto-scales |
| **Data structures** | Rich (sorted sets, streams, etc.) | KV + document only |
| **Cost model** | Pay for provisioned RAM | Pay per request or provisioned capacity |
| **Max value size** | 512 MB | 400 KB per item |
| **Best for** | Cache, ephemeral state, complex data ops | Primary durable store, serverless apps |

## AWS equivalent

| Use case | Service |
|---|---|
| In-memory cache / session store | ElastiCache for Redis |
| Durable KV store at scale | DynamoDB |
| DynamoDB with microsecond reads | DynamoDB + DAX |
| Simple distributed cache | ElastiCache for Memcached |

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you know Redis beyond "it's a cache" — and know DynamoDB's access pattern constraints.

**Strong answer pattern:**
1. Identify what kind of state you're storing — session (ephemeral), rate limit counter (ephemeral), or user data (durable)?
2. Redis for ephemeral, in-memory, complex data structures
3. DynamoDB for durable, primary store, serverless, any scale
4. Name the specific Redis data structure for the use case — don't just say "Redis"
5. For DynamoDB: discuss partition key design to avoid hot partitions

## Related topics

- [Caching](../caching/index.md) — Redis as a cache layer
- [Consistent Hashing](../patterns/consistent-hashing.md) — how Redis Cluster distributes data
- [Rate Limiting](../patterns/rate-limiting.md) — Redis counters for rate limiting
- [SQL vs NoSQL](sql-vs-nosql.md) — when KV beats relational
