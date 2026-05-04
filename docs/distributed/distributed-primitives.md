# Distributed Primitives

Probabilistic and approximate data structures that power large-scale distributed systems. They trade a small amount of accuracy for massive savings in memory and computation. Understanding these is what separates "I know what Cassandra is" from "I know how Cassandra works."

---

## Bloom Filter

### What it is

A space-efficient probabilistic data structure that answers the question: **"Have I seen this item before?"**

- **False positives possible:** may say "yes" for an item not in the set (~1%)
- **False negatives impossible:** if it says "no," the item is definitely not in the set
- **No deletion** (in the basic form)

### How it works

A Bloom filter is an array of bits + a set of hash functions:

```
Bit array (size m=10):  [0][0][0][0][0][0][0][0][0][0]
Hash functions: h1, h2, h3 (each maps item → index in array)

Insert "apple":
  h1("apple") = 2 → set bit[2] = 1
  h2("apple") = 5 → set bit[5] = 1
  h3("apple") = 8 → set bit[8] = 1
  
  Array: [0][0][1][0][0][1][0][0][1][0]

Insert "banana":
  h1("banana") = 0 → set bit[0] = 1
  h2("banana") = 3 → set bit[3] = 1
  h3("banana") = 5 → bit[5] already 1
  
  Array: [1][0][1][1][0][1][0][0][1][0]

Check "apple":
  h1("apple") = 2 → bit[2] = 1 ✓
  h2("apple") = 5 → bit[5] = 1 ✓
  h3("apple") = 8 → bit[8] = 1 ✓
  → "Probably in set" (correct)

Check "grape":
  h1("grape") = 1 → bit[1] = 0 ✗
  → "Definitely NOT in set" (correct)

Check "cherry" (never inserted, false positive):
  h1("cherry") = 0 → bit[0] = 1 ✓
  h2("cherry") = 3 → bit[3] = 1 ✓
  h3("cherry") = 5 → bit[5] = 1 ✓
  → "Probably in set" ← WRONG (false positive, bits were set by apple+banana)
```

### Implementation

```python
import hashlib
import math

class BloomFilter:
    def __init__(self, expected_items: int, false_positive_rate: float = 0.01):
        # Optimal bit array size
        self.m = self._optimal_m(expected_items, false_positive_rate)
        # Optimal number of hash functions
        self.k = self._optimal_k(self.m, expected_items)
        self.bits = bytearray(self.m // 8 + 1)
        self.count = 0
    
    def _optimal_m(self, n: int, p: float) -> int:
        """Optimal bit array size: m = -n*ln(p) / (ln2)^2"""
        return int(-n * math.log(p) / (math.log(2) ** 2))
    
    def _optimal_k(self, m: int, n: int) -> int:
        """Optimal hash count: k = (m/n) * ln2"""
        return int((m / n) * math.log(2))
    
    def _hashes(self, item: str) -> list[int]:
        """Generate k independent hash positions."""
        result = []
        for i in range(self.k):
            h = hashlib.sha256(f"{item}:{i}".encode()).hexdigest()
            result.append(int(h, 16) % self.m)
        return result
    
    def add(self, item: str):
        for pos in self._hashes(item):
            self.bits[pos // 8] |= (1 << (pos % 8))
        self.count += 1
    
    def might_contain(self, item: str) -> bool:
        """Returns True if item MIGHT be in set; False if DEFINITELY not."""
        return all(
            self.bits[pos // 8] & (1 << (pos % 8))
            for pos in self._hashes(item)
        )
    
    def memory_bytes(self) -> int:
        return len(self.bits)

# Memory comparison:
# 1 billion URLs in hash set:  50GB
# 1 billion URLs in bloom filter (1% FP rate): ~1.2GB
bf = BloomFilter(expected_items=1_000_000_000, false_positive_rate=0.01)
print(f"Memory: {bf.memory_bytes() / 1024**3:.2f} GB")  # ~1.2 GB
```

### False positive rate formula

```
p ≈ (1 - e^(-kn/m))^k

Where:
  n = items inserted
  m = bit array size
  k = hash functions
  p = false positive probability

Optimal k = (m/n) × ln(2) minimizes false positive rate.

Practical values for 1% false positive rate:
  ~10 bits per item needed
  ~7 hash functions
  
  100M items → 100M × 10 bits = 125MB
  1B items   → 1B × 10 bits  = 1.25GB
```

### Where Bloom filters are used

```
Cassandra:
  Each SSTable has a Bloom filter.
  Before reading from disk: "does this SSTable contain key X?"
  False positive: read SSTable anyway (small cost)
  True negative: skip SSTable entirely (huge saving)
  Without Bloom filter: every read scans every SSTable → O(n) disk I/O
  With Bloom filter: 1-2 disk reads per query

HBase/BigTable:
  Same as Cassandra — SSTable Bloom filter to avoid unnecessary disk reads

Web crawler:
  "Have I crawled this URL before?" — 1B URLs in ~1.2GB
  False positive: skip a URL that hasn't been crawled (acceptable)
  False negative: impossible — never re-crawls a seen URL

Chrome safe browsing:
  "Is this URL in the malware database?"
  Local Bloom filter for fast first-pass check
  False positive: do a full server lookup (acceptable)
  False negative: impossible — never misses a malware URL

Redis:
  redis.bf.add() / redis.bf.exists() — RedisBloom module
  Use case: fraud detection (seen this device ID before?),
            duplicate detection (seen this event ID?)
```

---

## Merkle Tree

### What it is

A Merkle tree (hash tree) is a binary tree where each leaf node contains the hash of a data block, and each internal node contains the hash of its children. The root hash is a fingerprint of all the data.

**Key property:** If any data block changes, the root hash changes. And you can efficiently identify *which* data block changed by comparing subtrees.

### How it works

```
Data blocks: [D1, D2, D3, D4]

Leaf hashes:
  H1 = hash(D1) = "a3f2..."
  H2 = hash(D2) = "b7c1..."
  H3 = hash(D3) = "c9d4..."
  H4 = hash(D4) = "e1f8..."

Internal nodes:
  H12 = hash(H1 + H2) = "1a2b..."
  H34 = hash(H3 + H4) = "3c4d..."

Root:
  H1234 = hash(H12 + H34) = "5e6f..."

Tree structure:
          H1234 (root)
          /         \
        H12          H34
       /   \        /   \
      H1    H2    H3    H4
      |     |     |     |
      D1    D2    D3    D4
```

### Efficient synchronization between nodes

```
Node A (source of truth):   Node B (potentially out of sync):
  Root: H1234                 Root: H1234'  ← different root → out of sync

Step 1: Compare roots → different → data differs somewhere

Step 2: Compare children of root:
  H12 == H12? YES → left subtree identical (D1, D2 are in sync)
  H34 == H34'? NO → right subtree differs (D3 or D4 out of sync)

Step 3: Go deeper in the differing subtree:
  H3 == H3'? YES → D3 is in sync
  H4 == H4'? NO  → D4 is out of sync → only sync D4

Result: identified the exact differing block with O(log N) comparisons
vs naive full comparison: O(N) comparisons
```

```python
import hashlib
from dataclasses import dataclass
from typing import Optional

@dataclass
class MerkleNode:
    hash: str
    left: Optional['MerkleNode'] = None
    right: Optional['MerkleNode'] = None
    data: Optional[bytes] = None  # only for leaf nodes

class MerkleTree:
    def __init__(self, data_blocks: list[bytes]):
        self.leaves = [
            MerkleNode(hash=hashlib.sha256(block).hexdigest(), data=block)
            for block in data_blocks
        ]
        self.root = self._build(self.leaves)
    
    def _build(self, nodes: list[MerkleNode]) -> MerkleNode:
        if len(nodes) == 1:
            return nodes[0]
        if len(nodes) % 2 == 1:
            nodes.append(nodes[-1])  # duplicate last if odd count
        
        parents = []
        for i in range(0, len(nodes), 2):
            combined = nodes[i].hash + nodes[i+1].hash
            parent = MerkleNode(
                hash=hashlib.sha256(combined.encode()).hexdigest(),
                left=nodes[i],
                right=nodes[i+1],
            )
            parents.append(parent)
        return self._build(parents)
    
    def get_diff(self, other: 'MerkleTree') -> list[int]:
        """Return indices of data blocks that differ from other tree."""
        diffs = []
        self._compare(self.root, other.root, 0, len(self.leaves), diffs)
        return diffs
    
    def _compare(self, a: MerkleNode, b: MerkleNode, 
                 start: int, end: int, diffs: list[int]):
        if a.hash == b.hash:
            return  # subtree identical — no need to go deeper
        if a.data is not None:  # leaf node
            diffs.append(start)
            return
        mid = (start + end) // 2
        self._compare(a.left, b.left, start, mid, diffs)
        self._compare(a.right, b.right, mid, end, diffs)
```

### Where Merkle trees are used

```
Cassandra (anti-entropy repair):
  Each node builds a Merkle tree of its data for each token range.
  During repair: nodes exchange Merkle trees, compare root hashes.
  Differing subtrees → only sync those data ranges.
  Without Merkle: full table scan to find differences (hours)
  With Merkle: find differences in O(log N) comparisons (minutes)

Git:
  Every commit is a Merkle tree of file hashes.
  git diff: compare two trees → find changed files in O(log N)
  Commit hash = Merkle root → tampering any file changes the commit hash

Bitcoin/blockchain:
  Block's Merkle root is the hash of all transactions in the block.
  To verify one transaction is in a block: O(log N) proof (Merkle proof)
  Full block download not needed.

AWS DynamoDB / S3:
  Internal consistency verification — detect bitrot, replication lag

IPFS:
  Content addressing — every file chunk is identified by its Merkle hash
```

---

## HyperLogLog

### What it is

HyperLogLog (HLL) estimates the **cardinality** (number of distinct elements) of a large multiset using very little memory. It answers: **"How many unique items have I seen?"**

- **Exact counting** of 1 billion unique IDs: ~8GB RAM
- **HyperLogLog** for the same 1 billion IDs: ~1.5KB RAM with ~2% error

### How it works (intuition)

```
Observation: if you hash items uniformly and look at the binary representation,
the probability of seeing a hash starting with k zeros is 1/2^k.

If the maximum run of leading zeros seen so far is k,
then you've likely seen about 2^k distinct items.

Example:
  Hash item A: 001010... → 2 leading zeros → estimate ~4 items
  Hash item B: 000110... → 3 leading zeros → estimate ~8 items
  Hash item C: 010001... → 1 leading zero  → estimate ~2 items
  
  Max leading zeros = 3 → estimate: 2^3 = 8 distinct items
  (This is simplified — HLL uses multiple "buckets" and harmonic mean)
```

### Implementation

```python
import hashlib
import math

class HyperLogLog:
    def __init__(self, error_rate: float = 0.02):
        # b = number of bucket bits, m = 2^b buckets
        # Standard error ≈ 1.04 / sqrt(m)
        # error_rate ≈ 0.02 → b=10, m=1024 buckets
        self.b = max(4, math.ceil(math.log2((1.04 / error_rate) ** 2)))
        self.m = 1 << self.b    # 2^b buckets
        self.registers = [0] * self.m
    
    def _hash(self, item: str) -> int:
        return int(hashlib.sha256(item.encode()).hexdigest(), 16)
    
    def add(self, item: str):
        h = self._hash(item)
        # Use first b bits as bucket index
        bucket = h >> (64 - self.b)
        # Count leading zeros in remaining bits
        remaining = h & ((1 << (64 - self.b)) - 1)
        leading_zeros = self._count_leading_zeros(remaining, 64 - self.b) + 1
        # Update register if we've seen more leading zeros
        self.registers[bucket] = max(self.registers[bucket], leading_zeros)
    
    def _count_leading_zeros(self, value: int, bits: int) -> int:
        if value == 0:
            return bits
        return bits - value.bit_length()
    
    def count(self) -> int:
        """Estimate number of distinct items."""
        # Harmonic mean of 2^register values
        alpha = 0.7213 / (1 + 1.079 / self.m)
        estimate = alpha * self.m ** 2 / sum(2 ** -r for r in self.registers)
        
        # Small range correction
        if estimate <= 2.5 * self.m:
            zeros = self.registers.count(0)
            if zeros > 0:
                estimate = self.m * math.log(self.m / zeros)
        
        return int(estimate)
    
    def merge(self, other: 'HyperLogLog') -> 'HyperLogLog':
        """Merge two HLLs — gives count of union."""
        merged = HyperLogLog.__new__(HyperLogLog)
        merged.b = self.b
        merged.m = self.m
        merged.registers = [max(a, b) for a, b in zip(self.registers, other.registers)]
        return merged
    
    def memory_bytes(self) -> int:
        return self.m  # one byte per register

# Comparison:
# Exact count of 1B items: 8GB (Python dict)
# HLL of 1B items: ~6KB at 2% error
hll = HyperLogLog(error_rate=0.02)
print(f"Memory: {hll.memory_bytes()} bytes")  # 1024 bytes
```

### Where HyperLogLog is used

```
Redis:
  PFADD key item     → add to HyperLogLog
  PFCOUNT key        → get cardinality estimate
  PFMERGE dest src1 src2  → merge multiple HLLs

  Use case: unique visitor count
    PFADD "visitors:2024-04-28" "user_abc"
    PFADD "visitors:2024-04-28" "user_xyz"
    PFCOUNT "visitors:2024-04-28"  → ~2 (but scales to billions)

Twitter:
  Count unique users who saw a tweet (reach)
  Billions of impressions → HLL tracks unique viewers in KB

Google Analytics:
  Unique pageviews, unique users per page
  Exact counting at scale is prohibitively expensive

Database query optimization:
  PostgreSQL, BigQuery use HLL for cardinality estimation in query planning
  "How many distinct values in this column?" → query plan choices

Merging across time windows:
  # Daily HLL
  PFADD "visitors:2024-04-27" ...
  PFADD "visitors:2024-04-28" ...
  
  # Weekly unique visitors (union of daily HLLs)
  PFMERGE "visitors:week" "visitors:2024-04-22" ... "visitors:2024-04-28"
  PFCOUNT "visitors:week"  → weekly unique visitors
```

---

## Count-Min Sketch

### What it is

Count-Min Sketch estimates the **frequency** of items in a stream using sub-linear memory. It answers: **"How many times have I seen this item?"**

- Exact frequency counting of 1M unique items: ~8MB
- Count-Min Sketch: ~50KB with ~1% overcount error

### How it works

```
A 2D array: d rows × w columns
d hash functions, one per row.
Each row is an independent frequency table.

To count item X:
  For each row i: increment counter[i][hash_i(X) % w]

To query item X:
  For each row i: read counter[i][hash_i(X) % w]
  Return the MINIMUM across all rows
  (minimum because hash collisions only OVER-count, never under-count)

d=4 rows, w=8 columns:
  Row 0: [0][0][0][2][0][3][0][1]
  Row 1: [0][3][0][0][2][0][1][0]
  Row 2: [1][0][2][0][0][3][0][0]
  Row 3: [0][2][0][0][3][0][1][0]

Query "apple" (hash maps to positions 3, 4, 0, 4):
  Row 0: counter[3] = 2
  Row 1: counter[4] = 2
  Row 2: counter[0] = 1
  Row 3: counter[4] = 3
  min(2, 2, 1, 3) = 1 → estimate: 1 occurrence
```

```python
import hashlib

class CountMinSketch:
    def __init__(self, width: int = 1000, depth: int = 5):
        self.width = width
        self.depth = depth
        self.table = [[0] * width for _ in range(depth)]
    
    def _hashes(self, item: str) -> list[int]:
        return [
            int(hashlib.sha256(f"{item}:{i}".encode()).hexdigest(), 16) % self.width
            for i in range(self.depth)
        ]
    
    def add(self, item: str, count: int = 1):
        for row, col in enumerate(self._hashes(item)):
            self.table[row][col] += count
    
    def estimate(self, item: str) -> int:
        """Estimate frequency. May overcount, never undercount."""
        return min(self.table[row][col] for row, col in enumerate(self._hashes(item)))
    
    def memory_bytes(self) -> int:
        return self.width * self.depth * 4  # 4 bytes per int

# Memory comparison:
# Exact hash map for 1M items (avg 20 bytes/entry): 20MB
# Count-Min Sketch (w=1000, d=5): 20KB
cms = CountMinSketch(width=1000, depth=5)
cms.add("GET /api/products")
cms.add("GET /api/products")
cms.add("POST /api/orders")
print(cms.estimate("GET /api/products"))  # 2 (exact in this case)
```

### Where Count-Min Sketch is used

```
Network routers:
  Track top-N most frequent source IPs (DDoS detection)
  Millions of packets/sec → exact hash map too slow
  Count-Min Sketch fits in L1 cache → microsecond query

Redis Streams (approximate top-N):
  Track trending hashtags
  Increment count for each hashtag seen
  Query top-N frequently seen hashtags

Databases (query optimization):
  PostgreSQL: approximate frequency of column values
  Used to estimate query plan selectivity

Rate limiting:
  "How many requests from IP X in the last minute?"
  Time-decayed Count-Min Sketch: windows decay old counts
```

---

## Summary comparison

| Structure | Problem | Error type | Memory | Real uses |
|---|---|---|---|---|
| Bloom Filter | Set membership ("seen before?") | False positives only | ~10 bits/item | Cassandra, Chrome safe browsing, crawlers |
| Merkle Tree | Data synchronization ("what differs?") | None (exact) | O(n) hashes | Cassandra repair, Git, Bitcoin |
| HyperLogLog | Cardinality ("how many unique?") | ~2% overcount | ~1.5KB for any n | Redis PFCOUNT, analytics, query planning |
| Count-Min Sketch | Frequency ("how often?") | Overcount only | ~50KB for 1M items | Network routers, trending topics, rate limiting |

---

## Interview talking points

!!! tip "Key things to say"
    1. **Bloom filter** — false positives only (you might re-check unnecessarily), never false negatives (you never skip something you should check). Cassandra uses this to avoid unnecessary disk reads
    2. **Merkle tree** — the key insight is that identical subtrees can be skipped. Cassandra anti-entropy repair compares Merkle trees to find out-of-sync data ranges in O(log N) instead of O(N)
    3. **HyperLogLog** — counting 1 billion unique visitors in 1.5KB with 2% error is the selling point. Redis PFCOUNT is the production implementation. Can merge HLLs — daily → weekly unique visitor counts
    4. **Count-Min Sketch** — overcounts only (due to hash collisions), never undercounts. Minimum across rows is the key trick. Network routers use this for DDoS detection in L1 cache

## Related topics

- [Web Crawler](../case-studies/web-crawler.md) — Bloom filter for URL deduplication
- [Distributed Cache](../case-studies/distributed-cache.md) — HyperLogLog for analytics
- [Replication](../patterns/replication.md) — Merkle trees power Cassandra's anti-entropy repair
- [Gossip Protocol](gossip.md) — often combined with Merkle trees for efficient state reconciliation
