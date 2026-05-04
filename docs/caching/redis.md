# Redis Deep Dive

Redis (Remote Dictionary Server) is an in-memory data structure store used as a cache, database, message broker, and streaming engine. It is the default choice for distributed caching in most production systems.

## Architecture

```
Redis is single-threaded for command execution.
  → No lock contention
  → Predictable latency (no context switching)
  → All commands are serialized

I/O is multiplexed via epoll (Linux) / kqueue (macOS)
  → Handles thousands of concurrent connections with one thread
  → I/O wait doesn't block command execution

Since Redis 6.0: multi-threaded I/O for network reads/writes
  → Command execution is still single-threaded
  → Throughput improvement for large payloads only
```

**Throughput benchmark (single node):**

```
Simple GET/SET:   ~100K–200K ops/sec
Pipelining:       ~1M+ ops/sec
Latency p50:      < 0.1ms
Latency p99:      < 1ms
```

---

## Data Structures

Redis is not just a key-value store. Each data type is purpose-built for specific access patterns.

### String

Simplest type. Stores bytes (text, integers, serialized JSON, binary). Max 512 MB.

```python
redis.set("user:42:name", "Alice")
redis.get("user:42:name")          # "Alice"
redis.setex("session:abc", 3600, token)   # with TTL
redis.setnx("lock:resource", 1)    # set if not exists (distributed lock)
redis.incr("page:views")           # atomic increment
redis.incrby("page:views", 5)
redis.getset("key", "new_value")   # atomic swap
```

**Use cases:** Session tokens, counters, feature flags, JSON blobs, distributed locks.

---

### Hash

A map of field→value pairs within a single key. Ideal for objects.

```python
redis.hset("user:42", mapping={
    "name": "Alice",
    "email": "alice@example.com",
    "age": "30"
})
redis.hget("user:42", "name")          # "Alice"
redis.hmget("user:42", "name", "age")  # ["Alice", "30"]
redis.hgetall("user:42")               # {name, email, age}
redis.hincrby("user:42", "age", 1)     # atomic increment on field
redis.hdel("user:42", "email")
redis.hexists("user:42", "name")       # True
```

**Memory efficiency:** Redis uses a compact ziplist encoding for small hashes (< 128 fields, < 64 bytes/field). At scale, a hash per object is more memory efficient than a string per field.

**Use cases:** User profiles, product metadata, session data, counters per dimension.

---

### List

Doubly-linked list. O(1) push/pop from both ends. O(n) access by index.

```python
redis.lpush("queue:tasks", "task1", "task2")   # left push
redis.rpush("queue:tasks", "task3")             # right push
redis.lpop("queue:tasks")                       # pop from left
redis.rpop("queue:tasks")                       # pop from right

# Blocking pop (wait up to 30s for an item)
redis.blpop("queue:tasks", timeout=30)

# Trim to last 1000 items
redis.ltrim("logs:app", -1000, -1)

# Range (0-indexed)
redis.lrange("queue:tasks", 0, 9)   # first 10 items
```

**Use cases:** Task queues, activity feeds, recent items (capped list with LTRIM), pub/sub message history.

---

### Set

Unordered collection of unique strings. O(1) add/remove/lookup.

```python
redis.sadd("user:42:tags", "python", "redis", "aws")
redis.sismember("user:42:tags", "redis")   # True
redis.smembers("user:42:tags")              # {"python", "redis", "aws"}
redis.scard("user:42:tags")                # 3 (cardinality)

# Set operations
redis.sunion("user:42:tags", "user:43:tags")   # union
redis.sinter("user:42:tags", "user:43:tags")   # intersection
redis.sdiff("user:42:tags", "user:43:tags")    # difference
```

**Use cases:** Unique visitors, tags, friend lists, mutual friends (intersection), "users who bought X" recommendations.

---

### Sorted Set (ZSet)

Set where each member has a floating-point score. Members are sorted by score. O(log n) operations.

```python
redis.zadd("leaderboard", {"alice": 9500, "bob": 8200, "charlie": 9800})

# Top 3 players (highest score)
redis.zrevrange("leaderboard", 0, 2, withscores=True)
# [("charlie", 9800), ("alice", 9500), ("bob", 8200)]

# Rank of a player (0-indexed, ascending)
redis.zrank("leaderboard", "alice")    # 1 (0 = lowest)
redis.zrevrank("leaderboard", "alice") # 1 (0 = highest)

# Score of a player
redis.zscore("leaderboard", "alice")   # 9500.0

# Players with score between 9000-10000
redis.zrangebyscore("leaderboard", 9000, 10000, withscores=True)

# Increment score atomically
redis.zincrby("leaderboard", 100, "alice")   # alice now has 9600
```

**Use cases:** Leaderboards, rate limiting (score = timestamp), priority queues, geospatial indexes (score = encoded lat/lng), time-series data.

---

### Bitmap

String type used as a bit array. O(1) bit set/get. Extremely memory efficient.

```python
# Track daily active users (bit = user_id, value = 1 if active)
redis.setbit("active:2024-04-26", user_id, 1)
redis.getbit("active:2024-04-26", user_id)    # 1 or 0

# Count active users on a day
redis.bitcount("active:2024-04-26")            # count of 1 bits

# Users active on both days
redis.bitop("AND", "active:both", "active:2024-04-26", "active:2024-04-27")
redis.bitcount("active:both")
```

**Memory:** 1 bit per user. 100M users = 12.5 MB. Much more efficient than a Set.

**Use cases:** Daily active users, feature flags per user, presence tracking, bloom filter approximation.

---

### HyperLogLog

Probabilistic data structure for cardinality estimation. Uses ≤ 12 KB regardless of input size. ~0.81% error rate.

```python
# Count unique visitors (no duplicates stored, just count)
redis.pfadd("visitors:2024-04-26", user_id)
redis.pfcount("visitors:2024-04-26")   # approx unique count

# Merge multiple HLL (e.g., weekly unique from daily HLLs)
redis.pfmerge("visitors:week", "visitors:mon", "visitors:tue", ...)
redis.pfcount("visitors:week")
```

**Trade-off:** Cannot tell you *which* users visited, only *how many*.

**Use cases:** Unique visitors, unique search queries, unique IPs — anywhere you need "count distinct" at scale.

---

### Stream

Append-only log with consumer groups. Inspired by Kafka.

```python
# Produce
redis.xadd("events:orders", {"order_id": "123", "amount": "99.99"})

# Consume (read new messages)
redis.xread({"events:orders": "$"}, block=0, count=10)

# Consumer groups (competing consumers, at-least-once delivery)
redis.xgroup_create("events:orders", "order-service", "$", mkstream=True)
messages = redis.xreadgroup("order-service", "consumer-1", {"events:orders": ">"})
# Process...
redis.xack("events:orders", "order-service", message_id)
```

**Use cases:** Event sourcing, activity logs, inter-service messaging (lightweight Kafka alternative), real-time analytics.

---

## Persistence

Redis is in-memory but supports two persistence mechanisms:

### RDB (Redis Database Backup) — Snapshot

Periodically saves a point-in-time snapshot of all data to disk.

```
# redis.conf
save 900 1       # save if ≥ 1 key changed in 900s
save 300 10      # save if ≥ 10 keys changed in 300s
save 60 10000    # save if ≥ 10000 keys changed in 60s

dbfilename dump.rdb
dir /var/lib/redis
```

**Process:** Redis forks a child process. Child writes snapshot to disk while parent continues serving requests. No blocking.

**Pros:** Compact file, fast restart, minimal runtime performance impact.

**Cons:** Data loss window = time since last snapshot. If crash at t=299s, lose ~299s of writes.

---

### AOF (Append-Only File) — Write Log

Logs every write command. On restart, replays the log to reconstruct state.

```
# redis.conf
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec   # options: always | everysec | no
```

| `appendfsync` | Durability | Performance |
|---|---|---|
| `always` | No data loss (each command fsync'd) | Slow (fsync on every write) |
| `everysec` | Lose up to 1 second of data | Good (background fsync) |
| `no` | Lose data since last OS flush | Best (OS controls fsync) |

**AOF rewrite:** AOF grows indefinitely. Redis compacts it periodically:

```
BGREWRITEAOF  # manual trigger
# or configure:
auto-aof-rewrite-percentage 100   # rewrite when AOF doubles in size
auto-aof-rewrite-min-size 64mb    # minimum size before rewrite
```

**Pros:** Much lower data loss risk. `always` mode = zero data loss.

**Cons:** Larger files than RDB. Slower restart (replaying log vs loading snapshot).

---

### Combined RDB + AOF

Recommended for production:

```
# redis.conf
appendonly yes
appendfsync everysec
save 900 1
save 300 10
```

On restart: AOF is preferred (more complete). RDB used if AOF is missing or corrupt.

---

## Pub/Sub

Redis Pub/Sub enables fire-and-forget messaging between publishers and subscribers.

```python
# Publisher
redis.publish("channel:notifications", json.dumps({
    "type": "order_shipped",
    "order_id": 123
}))

# Subscriber (blocking)
pubsub = redis.pubsub()
pubsub.subscribe("channel:notifications")
for message in pubsub.listen():
    if message['type'] == 'message':
        data = json.loads(message['data'])
        handle_notification(data)

# Pattern subscribe
pubsub.psubscribe("channel:*")   # subscribe to all channels matching pattern
```

**Limitations:**
- **No persistence:** Messages lost if subscriber is offline
- **No delivery guarantee:** Fire-and-forget only
- **No consumer groups:** Each subscriber receives every message

For durable messaging, use **Redis Streams** or a dedicated broker (Kafka, SQS).

**Use cases:** Cache invalidation broadcast, real-time notifications, chat presence (online/offline status), live dashboards.

---

## Lua scripting (atomic operations)

Redis executes Lua scripts atomically — the entire script runs as a single operation with no interleaving.

```lua
-- Rate limiting script (token bucket, atomic)
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local rate = tonumber(ARGV[3])

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1]) or capacity
local ts = tonumber(data[2]) or now

-- Refill tokens
local elapsed = now - ts
local new_tokens = math.min(capacity, tokens + elapsed * rate)

if new_tokens >= 1 then
    redis.call('HMSET', key, 'tokens', new_tokens - 1, 'ts', now)
    redis.call('EXPIRE', key, 3600)
    return 1  -- allowed
else
    return 0  -- rejected
end
```

```python
script = redis.register_script(lua_script)
result = script(keys=[rate_key], args=[100, time.time(), 10])
```

**Use cases:** Rate limiting, distributed locks, atomic counter operations, compare-and-swap.

---

## Distributed locks

Redis is commonly used to implement distributed mutual exclusion.

### Simple lock (SET NX EX)

```python
# Acquire lock (atomic set if not exists)
acquired = redis.set(
    "lock:resource:42",
    unique_token,       # unique per lock holder
    nx=True,            # only set if not exists
    ex=30               # auto-release after 30s (safety net)
)

if not acquired:
    raise LockNotAcquired()

try:
    # Critical section
    do_work()
finally:
    # Release — only if we still hold it
    script = """
    if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
    else
        return 0
    end
    """
    redis.eval(script, 1, "lock:resource:42", unique_token)
```

**Key properties:**
- `NX` prevents two threads from acquiring simultaneously
- `EX` prevents deadlock if holder crashes
- Check-and-delete with Lua prevents releasing another holder's lock

### Redlock (multi-node distributed lock)

For stronger guarantees, acquire the lock on N/2+1 Redis nodes:

```
5 Redis nodes (independent, no replication)
Acquire on ≥ 3 nodes within timeout
Lock is valid only if acquired on majority
```

See the [Distributed Locks](../distributed/distributed-locks.md) page for full Redlock details and controversies.

---

## Key design patterns

### Namespace keys

```
# Format: entity:id:attribute
user:42:profile
user:42:sessions
order:999:items

# Scan by prefix (use SCAN, not KEYS in production)
for key in redis.scan_iter("user:42:*"):
    redis.delete(key)
```

**Never use KEYS \* in production** — it blocks the server for O(n) over all keys.

### Object compression

For large JSON objects, compress before storing:

```python
import zlib, json

def cache_set(key: str, data: dict, ttl: int = 300):
    compressed = zlib.compress(json.dumps(data).encode())
    redis.setex(key, ttl, compressed)

def cache_get(key: str) -> dict | None:
    raw = redis.get(key)
    if raw is None:
        return None
    return json.loads(zlib.decompress(raw))
```

Typical compression ratio: 5–10x for JSON. Saves memory, reduces network transfer.

---

## Redis vs Memcached

| | Redis | Memcached |
|---|---|---|
| Data structures | Rich (8+ types) | Strings only |
| Persistence | RDB + AOF | None |
| Replication | Async, built-in | None (client-side only) |
| Clustering | Native (Redis Cluster) | Client-side sharding |
| Pub/Sub | Yes | No |
| Lua scripting | Yes | No |
| Streams | Yes | No |
| Multi-threading | I/O only (6.0+) | Full (all cores) |
| Max value size | 512 MB | 1 MB |

**Choose Redis** for nearly all use cases. Choose Memcached only if you need multi-threaded CPU utilization for simple string caching at extreme throughput (100K+ ops/sec per core).

---

## Interview angle

!!! tip "What interviewers are testing"
    They want to know which data structure to use for a given problem — not just that Redis exists.

**Data structure quick-pick:**

| Problem | Redis type |
|---|---|
| Cache user profile | String (JSON) or Hash |
| Session store | String with TTL |
| Leaderboard | Sorted Set |
| Rate limiting counter | String (INCR) |
| Rate limiting (sliding window) | Sorted Set (score = timestamp) |
| Unique visitor count | HyperLogLog |
| Daily active users (set membership) | Bitmap |
| Task queue | List (LPUSH / BRPOP) |
| Pub/sub messaging | Pub/Sub or Stream |
| Distributed lock | String (SET NX EX) |
| Friend graph intersection | Set (SINTER) |

## Related topics

- [Distributed Caching](distributed-caching.md) — Redis Cluster and replication
- [Cache Patterns & Pitfalls](cache-patterns.md) — stampede, penetration
- [Rate Limiting](../patterns/rate-limiting.md) — Redis-based rate limiting algorithms
- [Distributed Locks](../distributed/distributed-locks.md) — Redlock and lock patterns
- [Key-Value Stores](../storage/key-value-stores.md) — Redis as a primary database
