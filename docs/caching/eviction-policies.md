# Eviction Policies

When a cache reaches its memory limit, it must decide which entries to remove. The eviction policy is a critical tuning decision — the wrong choice can halve your hit rate with no change to cache size.

## Why eviction matters

A cache with 100 MB and the right eviction policy can outperform a cache with 1 GB and the wrong one. Eviction is about predicting which data will be needed in the future — using only past access patterns.

```
Cache hit rate = hits / (hits + misses)

A 1% improvement in hit rate on a high-traffic system
can eliminate millions of DB queries per day.
```

---

## Policies

### LRU — Least Recently Used

Evicts the entry that was **accessed least recently**. The intuition: if something hasn't been used in a while, it probably won't be used soon.

```
Access sequence: A B C D A B E

Cache size: 3
After A:  [A]
After B:  [A, B]
After C:  [A, B, C]
After D:  [B, C, D]  ← A evicted (least recently used)
After A:  [C, D, A]  ← B evicted
After B:  [D, A, B]  ← C evicted
After E:  [A, B, E]  ← D evicted
```

**Implementation: doubly-linked list + hash map**

```python
from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = OrderedDict()

    def get(self, key: int) -> int:
        if key not in self.cache:
            return -1
        self.cache.move_to_end(key)  # mark as recently used
        return self.cache[key]

    def put(self, key: int, value: int) -> None:
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)  # remove LRU item
```

**O(1)** for both get and put.

**Pros:** Works well with temporal locality (recently accessed data likely to be accessed again). Simple and well-understood.

**Cons:** Doesn't account for access frequency — a single recent access keeps a cold item alive. Vulnerable to sequential scan pollution (a large one-time scan evicts the entire working set).

**Best for:** General-purpose caching. Default choice for Redis.

---

### LFU — Least Frequently Used

Evicts the entry with the **fewest total accesses**. Intuition: popular data should stay in cache regardless of recency.

```
Access sequence: A A A B B C D

Frequencies:
  A: 3
  B: 2
  C: 1
  D: 1  ← D evicted first (tied with C; use insertion order as tiebreaker)
```

**Implementation: min-heap or frequency-bucketed doubly linked lists**

```python
from collections import defaultdict

class LFUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.min_freq = 0
        self.key_to_val = {}
        self.key_to_freq = {}
        self.freq_to_keys = defaultdict(OrderedDict)  # freq → {key: None} (ordered)

    def get(self, key: int) -> int:
        if key not in self.key_to_val:
            return -1
        self._increment_freq(key)
        return self.key_to_val[key]

    def put(self, key: int, value: int) -> None:
        if self.capacity <= 0:
            return
        if key in self.key_to_val:
            self.key_to_val[key] = value
            self._increment_freq(key)
            return
        if len(self.key_to_val) >= self.capacity:
            self._evict()
        self.key_to_val[key] = value
        self.key_to_freq[key] = 1
        self.freq_to_keys[1][key] = None
        self.min_freq = 1

    def _increment_freq(self, key):
        freq = self.key_to_freq[key]
        self.key_to_freq[key] = freq + 1
        del self.freq_to_keys[freq][key]
        if not self.freq_to_keys[freq] and freq == self.min_freq:
            self.min_freq += 1
        self.freq_to_keys[freq + 1][key] = None

    def _evict(self):
        key, _ = self.freq_to_keys[self.min_freq].popitem(last=False)
        del self.key_to_val[key]
        del self.key_to_freq[key]
```

**Pros:** Retains truly hot data across time. Ideal when some items are accessed orders of magnitude more than others.

**Cons:** Frequency counters accumulate indefinitely — a "burst popular" item from an hour ago stays in cache even if never accessed again. New items always start at frequency 1, making them vulnerable to early eviction.

**Best for:** Stable, long-lived hot sets where popularity doesn't change over time (e.g., top-100 products, frequently accessed config).

---

### ARC — Adaptive Replacement Cache

A hybrid that adapts between LRU and LFU behavior automatically, without manual tuning.

ARC maintains four internal lists:
- **T1:** Recently accessed items (seen exactly once) — LRU-like
- **T2:** Frequently accessed items (seen at least twice) — LFU-like
- **B1:** Ghost entries evicted from T1 (metadata only, no data)
- **B2:** Ghost entries evicted from T2 (metadata only, no data)

```
                    ┌─────────────────────────────────┐
                    │            ARC Cache             │
                    │  ┌──────┐ ┌──────┐              │
                    │  │  T1  │ │  T2  │  (actual data)│
                    │  └──────┘ └──────┘              │
                    │  ┌──────┐ ┌──────┐              │
                    │  │  B1  │ │  B2  │  (ghost keys) │
                    │  └──────┘ └──────┘              │
                    └─────────────────────────────────┘

A hit in B1 → increase T1 size (recent pattern dominant)
A hit in B2 → increase T2 size (frequent pattern dominant)
```

**Pros:** Self-tuning. Outperforms both LRU and LFU on mixed workloads. Patent-free implementations exist (e.g., CAR, CART).

**Cons:** More complex. Higher memory overhead (ghost lists). Not natively supported in Redis.

**Best for:** When your access pattern is unknown or mixed. Used in ZFS, IBM Spectrum Scale.

---

### TTL — Time-To-Live

Entries expire after a fixed duration, regardless of access patterns.

```
key: "user:42:profile"
value: {...}
TTL: 300 seconds  → auto-evicted at t+300s
```

TTL is not a replacement for LRU/LFU — it's typically combined with them. TTL handles **freshness**, while LRU/LFU handle **capacity**.

```python
# Redis
redis.setex("user:42", 300, json.dumps(user))   # expires in 300s

# Get remaining TTL
redis.ttl("user:42")   # → 247 (seconds remaining)
redis.pttl("user:42")  # → 247000 (milliseconds remaining)
```

**Lazy vs active expiry (Redis):**

- **Lazy expiry:** Key is checked and removed only on access. Memory not freed immediately.
- **Active expiry:** Redis runs a background task that samples random keys and removes expired ones. Trades CPU for memory.

```
Redis active expiry cycle:
  Every 100ms: sample 20 random keys with TTL
  If > 25% are expired → repeat immediately
  Goal: < 25% of keys with TTL are expired at any time
```

**TTL jitter:** Add random offset to prevent mass expiry (cache avalanche):

```python
import random
base_ttl = 300
jitter = random.randint(0, 60)  # ±0-60 seconds
redis.setex(key, base_ttl + jitter, value)
```

---

### FIFO — First In, First Out

Evicts the **oldest inserted** entry, regardless of access patterns.

```
Insert order: A → B → C → D (cache size = 3)
State: [A, B, C]
Insert D → evict A: [B, C, D]
Insert E → evict B: [C, D, E]
```

**Pros:** Extremely simple. Predictable. Low overhead.

**Cons:** Ignores access frequency and recency entirely. A hot item inserted early will be evicted before a cold item inserted recently.

**Best for:** Time-windowed data where newer is always better (e.g., per-minute metrics, rolling logs).

---

### Random Replacement

Evicts a randomly selected entry.

**Pros:** No overhead for tracking access history. Can approximate LRU performance under uniform access patterns.

**Cons:** Unpredictable. Can evict the hottest item.

**Best for:** Approximation in systems where tracking overhead matters (embedded systems, CPU caches with small tag arrays).

---

## Policy comparison

| Policy | Tracks | Overhead | Scan resistance | Best for |
|---|---|---|---|---|
| **LRU** | Recency | Low | Poor | General-purpose |
| **LFU** | Frequency | Medium | Good | Stable hot sets |
| **ARC** | Both (adaptive) | Medium-High | Excellent | Unknown/mixed patterns |
| **TTL** | Time since insert | Very low | N/A | Data freshness |
| **FIFO** | Insert order | Very low | N/A | Time-windowed data |
| **Random** | Nothing | Minimal | Poor | Approximation |

---

## Redis eviction configuration

Redis evicts when `maxmemory` is hit. Policy is set via `maxmemory-policy`:

```
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
```

| Policy | Behavior |
|---|---|
| `noeviction` | Return error on write when memory full (default) |
| `allkeys-lru` | LRU across all keys |
| `volatile-lru` | LRU only on keys with TTL set |
| `allkeys-lfu` | LFU across all keys |
| `volatile-lfu` | LFU only on keys with TTL set |
| `allkeys-random` | Random across all keys |
| `volatile-random` | Random only on keys with TTL set |
| `volatile-ttl` | Evict keys with shortest TTL first |

**Practical guidance:**
- Use `allkeys-lru` for pure caches (all keys can be evicted)
- Use `volatile-lru` when mixing cached data and persistent data in one Redis
- Use `allkeys-lfu` for workloads with highly skewed popularity (Zipf distribution)

---

## Redis LRU approximation

Redis does **not** use a true LRU (would require O(n) memory for linked list). Instead it uses **approximated LRU**: on eviction, sample N random keys (default N=5) and evict the one with the oldest access time.

```
# Increase sample size for better LRU approximation (at CPU cost)
maxmemory-samples 10
```

Empirically, 5 samples gives 95%+ of true LRU hit rate. 10 samples approaches 99%.

---

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you justify the policy against the workload — not just name it.

**Strong answer pattern:**
1. Ask: "Is the hot set stable or does popularity shift over time?"
2. Default to **LRU** (or `allkeys-lru` in Redis) for most cases
3. If popularity is highly skewed and stable → **LFU**
4. Always combine with **TTL** for data freshness
5. Add **TTL jitter** to prevent avalanche on high-traffic systems

## Related topics

- [Caching Strategies](caching-strategies.md) — how data enters the cache
- [Cache Invalidation](cache-invalidation.md) — how data becomes stale
- [Cache Patterns & Pitfalls](cache-patterns.md) — avalanche, stampede
- [Redis Deep Dive](redis.md) — Redis-specific eviction configuration
