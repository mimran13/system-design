# Probabilistic Data Structures

Probabilistic data structures trade exact correctness for dramatically lower memory and faster operations. They answer questions like "does this exist?" or "how many unique items?" with a small, bounded error rate — and they do it in constant time and kilobytes of memory.

They come up repeatedly in large-scale system design because exact data structures often don't scale.

---

## Why exact structures don't scale

```
Exact set membership check (HashSet):
  10M URLs, each 50 bytes → 500MB of memory, just for the set

HyperLogLog for 10M URLs:
  ~1.5KB of memory, ±0.81% error rate

Bloom filter for 10M URLs:
  ~9.6MB for 1% false positive rate
```

---

## Bloom Filter

A Bloom filter answers: **"Is this element definitely NOT in the set, or possibly in the set?"**

- **No false negatives** — if the filter says "not present," it's guaranteed absent
- **False positives possible** — "present" might be wrong (controlled by parameters)
- Space-efficient — represents millions of items in KB/MB

### How it works

```
Bit array of m bits, k hash functions

Insert "alice@example.com":
  hash1("alice") = 2   → set bit 2
  hash2("alice") = 7   → set bit 7
  hash3("alice") = 14  → set bit 14

Query "bob@example.com":
  hash1("bob") = 2     → bit 2 is set ✓
  hash2("bob") = 9     → bit 9 is NOT set → definitely NOT in set ✓

Query "carol@example.com":
  hash1("carol") = 2   → bit 2 is set ✓
  hash2("carol") = 7   → bit 7 is set ✓
  hash3("carol") = 14  → bit 14 is set ✓
  → "probably in set" (FALSE POSITIVE — carol was never inserted)
```

```python
from pybloom_live import BloomFilter

bf = BloomFilter(capacity=10_000_000, error_rate=0.01)  # 10M items, 1% false positive

bf.add("alice@example.com")
bf.add("bob@example.com")

print("alice@example.com" in bf)  # True  (definitely in set)
print("carol@example.com" in bf)  # False (definitely NOT in set)
                                   # or rarely True (false positive)
```

### Sizing

| Items | Error rate | Memory |
|---|---|---|
| 1M | 1% | ~1.2 MB |
| 10M | 1% | ~12 MB |
| 100M | 1% | ~120 MB |
| 10M | 0.1% | ~18 MB |

**Formula:** `m = -n × ln(p) / (ln 2)²` where n = items, p = error rate

### Real-world use

| System | Use case |
|---|---|
| **Cassandra** | Check if an SSTable might contain a key before reading disk |
| **PostgreSQL** | Query planning — estimate if a value exists |
| **Chrome** | Block known malicious URLs (local filter, server for positives) |
| **Redis** | ReBloom module for large-scale set membership |
| **CDN** | Check if content is cached before expensive origin fetch |
| **Email systems** | Dedup: check if email already delivered before re-sending |

---

## HyperLogLog (HLL)

HyperLogLog answers: **"How many unique items have I seen?"** — with ~0.81% error, using only ~1.5KB of memory regardless of the input size.

Exact cardinality counting requires storing every unique item (O(n) memory). HLL uses hashing and bit patterns to estimate cardinality in O(1) space.

### How it works (intuition)

```
Hash each element to a binary string.
Count the number of leading zeros in each hash.
If you've seen a hash with 10 leading zeros, you've probably seen ~2^10 = 1024 unique items.
Average across many "buckets" to reduce variance.

Hash("alice")  = 00000000101...  → 8 leading zeros → estimate ~256 items seen
Hash("bob")    = 00001010011...  → 4 leading zeros
Hash("carol")  = 01001110101...  → 1 leading zero
```

```python
import redis

r = redis.Redis()

# Add items
r.pfadd("unique_visitors:2024-01-15", "user:1001", "user:1002", "user:1003")
r.pfadd("unique_visitors:2024-01-15", "user:1001")  # duplicate — not counted

# Count unique
count = r.pfcount("unique_visitors:2024-01-15")
print(count)  # 3 (±0.81%)

# Merge multiple HLLs (e.g., weekly unique visitors)
r.pfmerge("unique_visitors:week", 
          "unique_visitors:2024-01-15",
          "unique_visitors:2024-01-16",
          "unique_visitors:2024-01-17")
```

### Memory: ~12KB for any cardinality

Whether you've seen 1,000 or 1 billion unique items, Redis HLL uses the same ~12KB.

### Real-world use

| System | Use case |
|---|---|
| **Analytics platforms** | Daily active users, unique page views |
| **Ad tech** | Unique impressions, reach estimation |
| **Databases** | Cardinality estimation for query planning (PostgreSQL) |
| **Network monitoring** | Count unique IP addresses in traffic |
| **Redis** | Native `PFADD` / `PFCOUNT` / `PFMERGE` commands |

**When to use HLL vs exact count:**
- Exact needed (billing, elections, legal): use an exact counter (Redis INCR + Set)
- Approximate is fine (analytics, trending): HLL — 1000× less memory

---

## Count-Min Sketch

Count-Min Sketch answers: **"How many times have I seen this item?"** — with bounded overcount error, in constant memory.

An exact frequency map requires O(n × item_size) memory. Count-Min Sketch uses a 2D array of counters.

### How it works

```
2D array: d hash functions × w counters (d rows, w columns)

Increment "apple":
  hash1("apple") = 3  → row 1, col 3: increment
  hash2("apple") = 7  → row 2, col 7: increment
  hash3("apple") = 1  → row 3, col 1: increment

Query "apple":
  row 1, col 3: 5
  row 2, col 7: 3
  row 3, col 1: 8
  → estimate = min(5, 3, 8) = 3  (never undercounts, may overcount due to collisions)
```

```python
from collections import defaultdict
import hashlib

class CountMinSketch:
    def __init__(self, width=1000, depth=5):
        self.w = width
        self.d = depth
        self.table = [[0] * width for _ in range(depth)]
        self.seeds = list(range(depth))

    def _hash(self, item, seed):
        return int(hashlib.md5(f"{seed}{item}".encode()).hexdigest(), 16) % self.w

    def add(self, item):
        for i in range(self.d):
            self.table[i][self._hash(item, self.seeds[i])] += 1

    def estimate(self, item):
        return min(self.table[i][self._hash(item, self.seeds[i])] for i in range(self.d))

cms = CountMinSketch()
for word in ["apple", "banana", "apple", "apple", "cherry", "banana"]:
    cms.add(word)

print(cms.estimate("apple"))   # 3
print(cms.estimate("banana"))  # 2
```

### Real-world use

| System | Use case |
|---|---|
| **Rate limiting** | Approximate per-IP request count without a counter per IP |
| **Trending topics** | Track word frequency in a stream (Twitter trends) |
| **Network routers** | Heavy hitter detection — which IPs send the most traffic? |
| **Databases** | Join order optimization via frequency estimates |
| **Recommendation systems** | Item popularity tracking at scale |

---

## Comparison

| Structure | Question | Error type | Memory | Operations |
|---|---|---|---|---|
| **Bloom Filter** | Is X in the set? | False positives only | ~10MB per 10M items | O(k) |
| **HyperLogLog** | How many unique items? | ±0.81% cardinality | ~12KB always | O(1) |
| **Count-Min Sketch** | How often does X appear? | Overcounts only | Configurable | O(d) |

---

## Interview angle

!!! tip "When these come up in design"
    - *"How does Cassandra avoid reading every SSTable on every query?"* → Bloom filter per SSTable. If the filter says the key definitely isn't in this SSTable, skip it.
    - *"How does Google Analytics count unique visitors at scale without storing every user ID?"* → HyperLogLog. Uses ~12KB per day/dimension, merges trivially, ±0.81% error acceptable for analytics.
    - *"How does Twitter find trending topics in real-time?"* → Count-Min Sketch over the tweet stream. Increment counters for each word, query top-k by frequency. Exact counts would require memory proportional to vocabulary size.
    - *"How do you detect heavy hitters (top 1% of IP traffic) in real-time?"* → Count-Min Sketch. When a bucket exceeds a threshold, flag that IP.

## Related topics

- [Redis Deep Dive](../caching/redis.md) — native HyperLogLog (PFADD/PFCOUNT) support
- [Storage: Wide-Column Stores](../storage/wide-column-stores.md) — Cassandra's Bloom filter usage
- [Storage Internals](storage-internals.md) — LSM trees and SSTables that Bloom filters protect
- [Back-of-Envelope Estimation](estimation.md) — knowing when approximate is good enough
