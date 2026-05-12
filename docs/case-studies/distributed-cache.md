# Design a Distributed Cache (Redis/Memcached)

## Problem statement

Design a distributed in-memory cache that:
- Stores key-value pairs with optional TTL
- Handles 1 million requests/sec with < 1ms p99 latency
- Scales horizontally across many nodes
- Survives individual node failures
- Supports common eviction policies (LRU, LFU, TTL)
- Handles hot keys (very popular keys)

## Clarifying questions

```
1. Read vs write ratio?
   → 90% reads, 10% writes (typical cache workload)

2. Value size?
   → Small-medium values, avg 1KB, max 1MB

3. Consistency model?
   → Best-effort (cache can be stale, DB is source of truth)

4. Persistence?
   → Optional: cache is ephemeral, but RDB snapshots for warm restarts

5. Replication?
   → Yes: replica per primary for read scaling + failover

6. Data types?
   → String, List, Hash, Set, Sorted Set (Redis model)
```

## Scale estimation

```
Target: 1M requests/sec
  Read: 900K/sec, Write: 100K/sec

Per node capacity (single Redis node, commodity server):
  ~100K ops/sec (single-threaded event loop)
  ~100GB RAM → ~100M keys at avg 1KB

Nodes needed for throughput:
  1M ops/sec ÷ 100K ops/node = 10 primary nodes

With replication (1 replica each): 20 nodes total

Storage:
  If caching 10% of a 1TB dataset: 100GB across 10 nodes = 10GB/node
```

---

## Core design: in-memory storage

The key insight: all data lives in RAM. No disk I/O on the hot path.

```python
import time
import threading
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Optional

@dataclass
class CacheEntry:
    value: Any
    expires_at: Optional[float]   # None = no expiry
    last_accessed: float
    access_count: int = 0

class LRUCache:
    """Single-node LRU cache with TTL support."""
    
    def __init__(self, max_size: int):
        self.max_size = max_size
        self._store: OrderedDict[str, CacheEntry] = OrderedDict()
        self._lock = threading.RLock()
    
    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._store:
                return None
            
            entry = self._store[key]
            
            # Check TTL
            if entry.expires_at and time.monotonic() > entry.expires_at:
                del self._store[key]
                return None
            
            # Move to end (most recently used)
            self._store.move_to_end(key)
            entry.last_accessed = time.monotonic()
            entry.access_count += 1
            return entry.value
    
    def set(self, key: str, value: Any, ttl_s: Optional[float] = None):
        with self._lock:
            expires_at = time.monotonic() + ttl_s if ttl_s else None
            
            if key in self._store:
                self._store.move_to_end(key)
            
            self._store[key] = CacheEntry(
                value=value,
                expires_at=expires_at,
                last_accessed=time.monotonic(),
            )
            
            # Evict if over capacity (remove least recently used = front)
            if len(self._store) > self.max_size:
                self._store.popitem(last=False)
    
    def delete(self, key: str) -> bool:
        with self._lock:
            return bool(self._store.pop(key, None))
```

---

## Eviction policies

When memory is full, something must be removed:

```
LRU (Least Recently Used):
  Evict the key that was accessed least recently
  Good for: temporal locality — recently used items likely used again
  Used by: Redis (allkeys-lru, volatile-lru)

LFU (Least Frequently Used):
  Evict the key accessed the fewest times
  Good for: popularity-based retention — keep hot keys regardless of recency
  Used by: Redis (allkeys-lfu, volatile-lfu)

TTL (Time-based):
  Evict keys whose TTL has expired
  Always happens passively; active expiration scans periodically

Random:
  Evict a random key
  Simple, surprisingly effective for uniform access patterns

No-eviction:
  Return error when memory is full
  Used when cache must not lose data (Redis as primary store)
```

```python
class EvictionPolicy:
    LRU = 'lru'
    LFU = 'lfu'
    TTL = 'ttl'
    RANDOM = 'random'

class CacheWithEviction:
    def __init__(self, max_bytes: int, policy: str = EvictionPolicy.LRU):
        self.max_bytes = max_bytes
        self.policy = policy
        self.current_bytes = 0
        self._store: dict[str, CacheEntry] = {}
    
    def _evict(self):
        if self.policy == EvictionPolicy.LRU:
            # Evict least recently accessed
            oldest_key = min(self._store, key=lambda k: self._store[k].last_accessed)
            self._remove(oldest_key)
        
        elif self.policy == EvictionPolicy.LFU:
            # Evict least frequently accessed
            least_used = min(self._store, key=lambda k: self._store[k].access_count)
            self._remove(least_used)
        
        elif self.policy == EvictionPolicy.RANDOM:
            import random
            key = random.choice(list(self._store.keys()))
            self._remove(key)
```

**Redis eviction policies in practice:**

```
allkeys-lru      → evict any key LRU (most common for pure cache)
volatile-lru     → evict only keys with TTL set, LRU order
allkeys-lfu      → evict any key LFU (better for skewed access patterns)
volatile-ttl     → evict keys with shortest remaining TTL first
noeviction       → return OOM error (use when cache is primary store)
```

---

## Distribution: consistent hashing

How do you decide which cache node holds a given key?

**Naive modulo hashing:**
```python
node_index = hash(key) % num_nodes

# Problem: if num_nodes changes (add/remove node),
# almost all keys map to different nodes → cache miss storm
# 
# Adding 1 node to a 10-node cluster:
# key % 10 vs key % 11 → ~90% of keys now map to a different node
```

**Consistent hashing (the right approach):**

```python
import hashlib
from bisect import bisect, insort

class ConsistentHashRing:
    def __init__(self, nodes: list[str], replicas: int = 150):
        """
        replicas: virtual nodes per physical node.
        More virtual nodes → more even distribution.
        """
        self.replicas = replicas
        self.ring: list[int] = []          # sorted hash positions
        self.node_map: dict[int, str] = {} # position → node name
        
        for node in nodes:
            self.add_node(node)
    
    def add_node(self, node: str):
        for i in range(self.replicas):
            position = self._hash(f"{node}:{i}")
            insort(self.ring, position)
            self.node_map[position] = node
    
    def remove_node(self, node: str):
        for i in range(self.replicas):
            position = self._hash(f"{node}:{i}")
            self.ring.remove(position)
            del self.node_map[position]
    
    def get_node(self, key: str) -> str:
        if not self.ring:
            raise RuntimeError("No nodes in ring")
        position = self._hash(key)
        # Find the first node at or after this position (wrap around)
        idx = bisect(self.ring, position) % len(self.ring)
        return self.node_map[self.ring[idx]]
    
    def _hash(self, key: str) -> int:
        return int(hashlib.md5(key.encode()).hexdigest(), 16)

# Usage
ring = ConsistentHashRing(['cache-1', 'cache-2', 'cache-3'])
node = ring.get_node('user:profile:12345')  # → 'cache-2' (always)

# Add a new node — only ~1/N keys remapped
ring.add_node('cache-4')
# Only ~25% of keys move. 75% still go to the same node.
```

---

## Replication

Each primary node has one or more replicas for read scaling and failover:

```
Primary-Replica model:

  Primary (writes + reads)
      │
      ├── Replica 1 (reads only, failover candidate)
      └── Replica 2 (reads only, failover candidate)

Write path:  Client → Primary → async replicate to replicas
Read path:   Client → any Replica (for read scaling)
             OR Client → Primary (for read-your-writes)

Failover:    Primary dies → Replica promoted to Primary
             (via Sentinel or Raft-based cluster management)
```

```python
class ReplicatedCacheClient:
    def __init__(self, primary: str, replicas: list[str]):
        self.primary = CacheNode(primary)
        self.replicas = [CacheNode(r) for r in replicas]
        self._replica_idx = 0
    
    def get(self, key: str, read_from_replica: bool = True) -> Optional[Any]:
        if read_from_replica and self.replicas:
            # Round-robin across replicas
            replica = self.replicas[self._replica_idx % len(self.replicas)]
            self._replica_idx += 1
            try:
                return replica.get(key)
            except ConnectionError:
                pass  # fall through to primary
        return self.primary.get(key)
    
    def set(self, key: str, value: Any, ttl_s: float = None):
        # Always write to primary; primary replicates to replicas
        self.primary.set(key, value, ttl_s)
```

---

## Cache write strategies

How you keep cache and database in sync:

```
Write-Through:
  Write → cache AND database simultaneously
  
  Client → Cache (write) → DB (write)
  
  Pros: cache always up to date, no stale reads
  Cons: write latency = DB latency (slower writes)
  Use: when reads must never be stale

Write-Around:
  Write → database only (bypass cache)
  Cache filled on next read (cache-aside)
  
  Client → DB (write)
  Client → Cache (miss) → DB (read) → Cache (populate)
  
  Pros: cache not polluted with infrequently read data
  Cons: first read after write is always a cache miss
  Use: data written once but read infrequently

Write-Back (Write-Behind):
  Write → cache only; flush to DB asynchronously
  
  Client → Cache (write, fast)
  Background: Cache → DB (async, batched)
  
  Pros: very low write latency
  Cons: data loss if cache crashes before flush; complexity
  Use: high write throughput, tolerant of small data loss window
```

---

## Hot key problem

A single key receiving millions of requests/sec overwhelms one node:

```
Problem:
  Key "homepage:trending" → always maps to cache-3
  cache-3: 50K req/sec for this key alone
  cache-3: CPU saturated → requests fail

Solutions:
```

```python
# Solution 1: Local in-process cache (L1 cache)
# Each application server caches the hot key locally
from functools import lru_cache
import time

class LocalCache:
    def __init__(self, ttl_s: float = 1.0):
        self._store: dict[str, tuple[Any, float]] = {}
        self.ttl_s = ttl_s
    
    def get(self, key: str) -> Optional[Any]:
        if key in self._store:
            value, expires = self._store[key]
            if time.monotonic() < expires:
                return value
            del self._store[key]
        return None
    
    def set(self, key: str, value: Any):
        self._store[key] = (value, time.monotonic() + self.ttl_s)

class TwoLevelCache:
    def __init__(self, local: LocalCache, distributed: DistributedCache):
        self.local = local          # L1: in-process, microseconds
        self.distributed = distributed  # L2: Redis, <1ms
    
    def get(self, key: str) -> Optional[Any]:
        # L1 hit: sub-millisecond, no network
        value = self.local.get(key)
        if value is not None:
            return value
        
        # L2 hit: Redis
        value = self.distributed.get(key)
        if value is not None:
            self.local.set(key, value)  # populate L1
            return value
        
        return None


# Solution 2: Key replication with random suffix
# Spread a hot key across multiple nodes
import random

def get_hot_key(cache_ring: ConsistentHashRing, base_key: str,
                value_fn, num_copies: int = 10) -> Any:
    """Distributes a hot key across N cache nodes."""
    shard = random.randint(0, num_copies - 1)
    shard_key = f"{base_key}:shard:{shard}"
    
    value = cache_ring.get_node(shard_key)  # picks different node per shard
    if value is None:
        value = value_fn()  # fetch from source
        cache_ring.set(shard_key, value, ttl_s=60)
    return value
```

---

## Cache stampede (Thundering Herd)

When a popular key expires, thousands of requests simultaneously miss and all go to the database:

```
t=0:    Key "popular:data" expires
t=0+1ms: 5,000 requests hit the cache → all miss
t=0+2ms: 5,000 requests query the DB simultaneously
t=0+5ms: DB is overwhelmed, latency spikes

Solutions:
```

```python
# Solution 1: Probabilistic early expiration (PER)
# Randomly re-fetch before expiry based on recompute time
import math, random

def get_with_per(cache, key: str, fetch_fn, ttl_s: float, beta: float = 1.0) -> Any:
    """
    beta: controls how aggressively to pre-fetch.
    Higher beta = earlier pre-fetch. 1.0 is typically good.
    """
    entry = cache.get_with_metadata(key)
    
    if entry:
        remaining_ttl = entry.expires_at - time.monotonic()
        recompute_time = entry.last_recompute_duration
        
        # Probabilistic check: the closer to expiry, the more likely to re-fetch
        if -beta * recompute_time * math.log(random.random()) >= remaining_ttl:
            # Pre-fetch this request's thread — others still get cached value
            value = fetch_fn()
            cache.set(key, value, ttl_s=ttl_s)
            return value
        
        return entry.value
    
    # Cache miss — must fetch
    value = fetch_fn()
    cache.set(key, value, ttl_s=ttl_s)
    return value


# Solution 2: Lock-based single fetch
# Only one process fetches from DB; others wait for the result
def get_with_lock(cache, redis, key: str, fetch_fn, ttl_s: float) -> Any:
    value = cache.get(key)
    if value is not None:
        return value
    
    lock_key = f"lock:{key}"
    acquired = redis.set(lock_key, "1", nx=True, ex=10)
    
    if acquired:
        # This process fetches from DB
        try:
            value = fetch_fn()
            cache.set(key, value, ttl_s=ttl_s)
            return value
        finally:
            redis.delete(lock_key)
    else:
        # Another process is fetching — wait briefly and retry
        time.sleep(0.05)
        return get_with_lock(cache, redis, key, fetch_fn, ttl_s)
```

---

## AWS architecture

```
Application Servers (ECS)
         │
         ▼
  ElastiCache Redis Cluster (Cluster Mode)
  ┌────────────────────────────────────────────┐
  │  Shard 1          Shard 2          Shard 3 │
  │  Primary+Replica  Primary+Replica  Primary+Replica │
  │  (slots 0-5460)   (5461-10922)     (10923-16383)   │
  └────────────────────────────────────────────┘
         │ cache miss
         ▼
  RDS Aurora (source of truth)

Monitoring:
  CacheHitRate → CloudWatch alarm if < 80%
  Evictions     → alarm if non-zero (memory pressure)
  Latency       → alarm if p99 > 1ms
  CPUUtilization → alarm if > 75% (Redis is single-threaded)
```

**Key ElastiCache configuration decisions:**

```
Node type:     r7g.xlarge (32GB RAM, low latency memory-optimized)
Cluster mode:  ON (horizontal sharding across 3+ shards)
Replicas:      1 per shard (read scaling + failover)
Backup:        Daily RDB snapshots (warm restarts after fleet replacement)
Encryption:    At-rest + in-transit (TLS)
VPC:           Private subnet, no public access
```

---

## Interview talking points

!!! tip "Key design decisions to discuss"
    1. **Consistent hashing** — adding/removing nodes only remaps 1/N keys, not all keys
    2. **Eviction policy choice** — LRU for temporal locality (web sessions), LFU for popularity (content), volatile-ttl when cache is mixed with session storage
    3. **Write strategy** — write-through for freshness, write-around to avoid cache pollution, write-back for throughput (with durability risk)
    4. **Hot key mitigation** — two-level cache (L1 local + L2 Redis) is the cleanest solution; key sharding as an alternative
    5. **Cache stampede** — lock-based fetch or probabilistic early expiration; never just let all threads hit the DB
    6. **Replication** — primary handles writes, replicas handle reads; Redis Sentinel or Cluster handles failover automatically

## Related topics

- [Caching](../caching/index.md) — cache-aside, read-through patterns
- [Consistent Hashing](../patterns/consistent-hashing.md) — key distribution across nodes
- [Distributed Locks](../distributed/distributed-locks.md) — used for cache stampede prevention
- [Key-Value Stores](../storage/key-value-stores.md) — Redis internals
