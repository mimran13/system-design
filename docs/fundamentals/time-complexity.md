# Time Complexity Cheatsheet

Big-O notation describes how performance scales with input size. The relevant question for systems work isn't "what's optimal in theory?" but "for the data structures I'd actually use in this system, what's the cost of each operation?" This page is a focused reference on the structures that show up in distributed systems.

---

## Big-O recap

`O(f(n))` means: as n grows, the runtime is at most a constant factor times f(n).

```
O(1)         constant            hash lookup, array index
O(log n)     logarithmic         binary search, B-tree, balanced BST
O(n)         linear              scan an array, iterate a list
O(n log n)   linearithmic        sort, fast Fourier transform
O(n^2)       quadratic           nested loops over all pairs
O(2^n)       exponential         brute-force subset enumeration
```

Big-O hides constants. In practice:

- A cache-friendly O(n) is often faster than a cache-unfriendly O(log n) for small n
- O(log n) with cache misses can lose to O(n) on contiguous arrays for n < ~1000

This is why hash maps with array-based open addressing beat balanced trees on small data.

---

## Arrays

| Operation | Complexity | Notes |
|---|---|---|
| Index access | O(1) | Cache-friendly; ideal traversal |
| Append | O(1) amortised | Doubling strategy |
| Insert at index | O(n) | Shift everything right |
| Delete at index | O(n) | Shift everything left |
| Search (unsorted) | O(n) | Linear scan |
| Search (sorted) | O(log n) | Binary search |

Cache-friendly. Default container in most languages (Vec, ArrayList, list, []slice).

---

## Linked lists

| Operation | Complexity | Notes |
|---|---|---|
| Index access | O(n) | Walk from head |
| Insert at known position | O(1) | Pointer manipulation |
| Delete at known position | O(1) | Pointer manipulation |
| Search | O(n) | Linear scan |

In modern systems, linked lists are usually the wrong choice. Cache-unfriendly; O(1) insert is rarely the bottleneck. Used in:

- LRU caches (combined with hash map for O(1) lookup)
- Lock-free queues
- Free-list memory allocators

---

## Hash maps / hash tables

| Operation | Average | Worst |
|---|---|---|
| Insert | O(1) | O(n) |
| Lookup | O(1) | O(n) |
| Delete | O(1) | O(n) |

Worst case (O(n)) requires adversarial inputs and a weak hash function. Modern implementations (Python `dict`, Java `HashMap`, Go `map`, Rust `HashMap`) randomise hashing to prevent this.

Resize: O(n) when load factor exceeded — amortises to O(1) per insert.

See [Hashing](hashing.md).

---

## Balanced BSTs (red-black, AVL)

| Operation | Complexity |
|---|---|
| Insert | O(log n) |
| Lookup | O(log n) |
| Delete | O(log n) |
| In-order traversal | O(n) |
| Range query | O(log n + k) for k results |

Used when you need **ordered traversal** along with fast lookup. C++ `std::map`, Java `TreeMap`, kernel red-black trees.

For pure lookup, hash maps win. For sorted iteration / range queries, BSTs / B-trees win.

---

## B-trees and B+ trees

The dominant on-disk index structure.

| Operation | Complexity |
|---|---|
| Lookup | O(log n) |
| Insert | O(log n) |
| Range query | O(log n + k / fanout) |

Multi-way trees with high fanout (~100-1000 children per node). Disk-friendly: a node fits in one disk page; tree depth stays small (typically 3-5 levels for billions of keys).

```
Root (1 node, fanout 100)
   ↓ 100 children
Internal (100 nodes, fanout 100 each)
   ↓ 10K leaf nodes
Leaves (each holding ~100 keys)

10,000 × 100 = 1M keys with depth 3
```

Used by: PostgreSQL, MySQL InnoDB, SQL Server, all major OLTP databases.

See [Storage Engine Internals](storage-internals.md).

---

## LSM-trees (Log-Structured Merge Trees)

Optimised for write-heavy workloads.

| Operation | Complexity |
|---|---|
| Write | O(1) amortised (write to memtable) |
| Read | O(log n) per level × number of levels |
| Compaction | Background O(n) work amortised |

Writes go to memory, then are flushed as sorted SSTables. Background compaction merges levels.

Trade: high write throughput, **higher read amplification** (must check multiple levels) and **higher write amplification** (compaction rewrites data several times).

Used by: RocksDB, Cassandra, LevelDB, ScyllaDB.

---

## Skip lists

Probabilistic alternative to balanced BSTs:

```
Level 3:  ──→  ──────────────→ end
Level 2:  ──→ ──→ ──→ ────→ end
Level 1:  ──→ ──→ ──→ ──→ ──→ end
Level 0:  every key
```

| Operation | Average |
|---|---|
| Insert | O(log n) |
| Lookup | O(log n) |
| Delete | O(log n) |

Simpler concurrent implementation than balanced BSTs. Used by:

- Redis sorted sets (ZSET)
- LevelDB / RocksDB memtable
- Java's ConcurrentSkipListMap

---

## Heaps (priority queues)

Binary heap stored in an array:

| Operation | Complexity |
|---|---|
| Insert | O(log n) |
| Extract min/max | O(log n) |
| Peek | O(1) |
| Build from N elements | O(n) |

Fibonacci heaps offer O(1) decrease-key but constants are bad — rarely used in practice.

Used in: top-K algorithms, scheduling, Dijkstra's algorithm, timer wheels.

---

## Tries (prefix trees)

Tree where each level represents one character:

| Operation | Complexity |
|---|---|
| Insert | O(L) where L = key length |
| Lookup | O(L) |
| Prefix search | O(L + k) for k matches |

Independent of total key count. Useful for autocomplete, IP routing tables (radix tries), URL routing.

Memory: O(total characters) — can be heavy. Compressed variants (radix tree, Patricia trie) reduce memory.

Used by: search autocomplete, DNS, Linux kernel IP routing, [search engines](../storage/search-engines.md).

---

## Bloom filters

Probabilistic set membership:

| Operation | Complexity |
|---|---|
| Insert | O(k) where k = number of hash functions |
| Lookup | O(k) |
| Memory | ~10 bits per element for 1% false positive |

Returns false positives but never false negatives. Used to skip expensive lookups (LSM-tree levels, distributed cache misses).

See [Probabilistic Data Structures](probabilistic-data-structures.md).

---

## Sorting algorithms

| Algorithm | Best | Average | Worst | Notes |
|---|---|---|---|---|
| Quicksort | O(n log n) | O(n log n) | O(n²) | Cache-friendly; unstable; Python uses Timsort instead |
| Mergesort | O(n log n) | O(n log n) | O(n log n) | Stable; O(n) extra memory |
| Heapsort | O(n log n) | O(n log n) | O(n log n) | In-place; not cache-friendly |
| Timsort | O(n) | O(n log n) | O(n log n) | Stable; adaptive; Python `sorted`, Java `Arrays.sort` for objects |
| Radix sort | O(nk) | O(nk) | O(nk) | For integers/strings of length k |
| Counting sort | O(n + range) | O(n + range) | O(n + range) | For small integer ranges |

For arbitrary comparisons, the lower bound is O(n log n). Linear-time sorts exploit input structure (small integer range, fixed-length keys).

---

## Graph algorithms

| Algorithm | Complexity | Use |
|---|---|---|
| BFS | O(V + E) | Shortest path (unweighted), level traversal |
| DFS | O(V + E) | Topological sort, cycle detection |
| Dijkstra (binary heap) | O((V+E) log V) | Shortest path (non-negative weights) |
| Bellman-Ford | O(VE) | Shortest path with negative weights |
| Floyd-Warshall | O(V³) | All-pairs shortest paths |
| Tarjan's SCC | O(V + E) | Strongly connected components |

For very large graphs, specialised structures (CSR — compressed sparse row) and engines (Pregel-style, GraphX, Neo4j) outperform generic implementations.

---

## Hash-based set operations

Common in distributed systems for bulk operations:

| Operation | Complexity (hash sets) |
|---|---|
| Union | O(\|A\| + \|B\|) |
| Intersection | O(min(\|A\|, \|B\|)) |
| Difference | O(\|A\|) |
| Membership | O(1) |

Sorted-merge variants: O(|A| + |B|) but cache-friendly and parallelisable.

---

## What this looks like in real systems

```
Postgres index lookup:           B+ tree O(log n), maybe 3-5 disk reads
Redis SET / GET:                  hash table O(1)
Redis ZADD / ZRANGEBYSCORE:       skip list O(log n + k)
DynamoDB GetItem (single key):    hash partition + B-tree O(log m), m = items in partition
Cassandra read:                   bloom filter check + LSM lookup O(log n × levels)
S3 GetObject:                     hash + range query, dominated by disk I/O
ElasticSearch term query:         posting list lookup, inverted index O(log n + k)
Kafka consume:                    segment file + offset index, O(1) for known offset
```

Knowing the underlying structure tells you the operation's true cost beyond "fast" or "slow."

---

## When O(n²) becomes a problem

```
n = 100        → 10,000 ops      microseconds
n = 1,000      → 1M ops          ~ms
n = 10,000     → 100M ops        ~100 ms — noticeable
n = 100,000    → 10B ops         minutes — production incident
n = 1,000,000  → 1T ops          impractical
```

The crossover where O(n²) becomes painful is around n=10,000. Common causes:

- Nested loops where both bounds grow with input
- "Get all then filter" instead of "filter as you go"
- O(n) lookups inside O(n) loops where O(1) lookup is available

Fix: batch lookups via hash map, sort then merge, use bulk APIs.

---

## When complexity doesn't matter

Big-O hides constants. For small n or hot paths, constant factors and cache behaviour can dominate:

- A linear scan of 100 items in an array beats a binary search tree for the same data
- Sorting then linear scanning beats hash-based dedup when data fits in cache
- Branch prediction and SIMD favour predictable patterns over "optimal" algorithms

Profile before optimising; complexity is a guide, not a guarantee.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you can pick the right data structure for the operation pattern, not just recite Big-O.

**Strong answer pattern:**
1. For point lookups: hash map (O(1)) — almost always
2. For sorted iteration / range queries: B-tree, sorted array, skip list (O(log n + k))
3. For top-K: heap (O(log n) push/pop)
4. For prefix queries / autocomplete: trie / radix tree (O(L) per query)
5. For probabilistic membership: Bloom filter (O(k), ~10 bits/element)
6. Big-O hides constants; cache behaviour can flip "theoretical optimal"

**Common follow-up:** *"When is a linked list ever the right choice?"*
> When you need O(1) insertion or removal at known positions and the cache penalty is acceptable. The classic example is an LRU cache: a hash map for O(1) lookup paired with a doubly-linked list for O(1) move-to-head. Or lock-free MPSC queues. For most application code, arrays or hash maps are better.

---

## Related topics

- [Memory Hierarchy](memory-hierarchy.md) — why cache-friendly structures beat "optimal" ones in practice
- [Database Indexes](database-indexes.md) — how B-trees back database lookups
- [Storage Engine Internals](storage-internals.md) — B-tree vs LSM trade-offs
- [Probabilistic Data Structures](probabilistic-data-structures.md) — Bloom filter, HyperLogLog
- [Numbers Every Engineer Should Know](numbers-to-know.md) — operation costs in concrete time
