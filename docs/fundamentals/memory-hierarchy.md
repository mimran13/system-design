# Memory Hierarchy & Cache Lines

Every latency number in [Numbers Every Engineer Should Know](numbers-to-know.md) — from sub-nanosecond CPU register access to 100ms cross-Atlantic round trips — comes from one underlying truth: **storage is a hierarchy of trade-offs between speed, size, and cost**. Understanding this hierarchy explains why algorithms that look similar on paper differ by 100× in practice.

---

## The hierarchy

```
                     ┌──────────────────────────────────────┐
                     │  CPU Registers       <1 ns    ~KB    │
                     ├──────────────────────────────────────┤
                     │  L1 Cache             1 ns    ~64 KB │
                     ├──────────────────────────────────────┤
                     │  L2 Cache             4 ns    ~512 KB│
                     ├──────────────────────────────────────┤
                     │  L3 Cache             10 ns   ~32 MB │  shared across cores
                     ├──────────────────────────────────────┤
                     │  Main Memory (DRAM)   100 ns  ~1 TB  │
                     ├──────────────────────────────────────┤
                     │  NVMe SSD             100 µs  ~10 TB │  1000× slower than RAM
                     ├──────────────────────────────────────┤
                     │  Network (same DC)    500 µs         │
                     ├──────────────────────────────────────┤
                     │  Spinning Disk        10 ms          │  100,000× slower than RAM
                     ├──────────────────────────────────────┤
                     │  Network (cross-region) 100 ms       │
                     └──────────────────────────────────────┘
```

Each level is roughly 10× larger and 10× slower than the one above. Each level **caches** the levels below — and that caching is the entire game.

---

## What a cache line is

CPUs don't read individual bytes from RAM. They read **cache lines** — typically 64 bytes — at a time.

```
You ask for byte at address 0x1000:
  CPU loads 64-byte line:  0x1000 .. 0x103F   into L1
  
You then ask for byte at address 0x1004:
  Already in L1 cache → 1 ns

You then ask for byte at address 0x2000:
  Different cache line → cache miss → 100 ns from RAM
```

Implication: accessing **adjacent** memory is much faster than accessing **scattered** memory, even if both are "in RAM."

---

## Locality of reference

Two kinds of locality drive performance:

| Type | Definition | Example |
|---|---|---|
| **Temporal locality** | Recently accessed data is likely accessed again soon | Loop variable, frequently-called function |
| **Spatial locality** | Data near recently accessed data is likely accessed soon | Iterating over an array |

Cache hit rates depend on whether your access patterns exploit locality.

---

## Why arrays beat linked lists in practice

Same Big-O, very different reality:

```c
// Array: contiguous memory
int arr[1000];          // 4000 bytes laid out in sequence
for (int i = 0; i < 1000; i++) sum += arr[i];
// Each cache line holds 16 ints → 1 miss per 16 reads → ~63 misses

// Linked list: scattered memory
struct Node* head = ...;   // each Node lives wherever malloc placed it
for (Node* n = head; n; n = n->next) sum += n->value;
// Each Node is a likely cache miss → ~1000 misses
```

The linked list is theoretically O(n) — same as the array — but in practice can be 10–20× slower because every access is a cache miss.

This is why:

- Modern hash tables use open addressing (probing within a contiguous array) over chaining
- B-trees beat binary search trees on disk and in memory
- Vec / ArrayList / std::vector are the default container, not LinkedList

---

## False sharing

Multiple cores caching the same line cause invalidation traffic:

```c
// Two threads, two counters laid out adjacent in memory
struct {
    int counter_a;   // thread A increments
    int counter_b;   // thread B increments
} state;             // both fit in same 64-byte cache line!
```

Thread A's write to `counter_a` invalidates thread B's cache line. B re-reads, writes, invalidates A's cache. Cores ping-pong the cache line — no logical contention, but huge slowdown.

Fix: pad to separate cache lines.

```c
struct {
    int counter_a;
    char pad[60];           // force counter_b onto next cache line
    int counter_b;
} state;
```

Or use language-level annotations:

```rust
#[repr(align(64))]
struct PaddedCounter(AtomicU64);
```

False sharing is a top cause of mysterious slowdowns in concurrent code.

---

## The TLB (Translation Lookaside Buffer)

Virtual addresses → physical addresses go through a **page table**. The TLB caches recent translations.

```
TLB hit:   <1 ns
TLB miss: ~100 ns (walk page table, possibly miss main memory)
```

Programs that touch many memory pages randomly (large hash tables, scattered allocations) suffer TLB misses. Mitigations:

- **Huge pages** (2 MB or 1 GB pages instead of 4 KB) → fewer page table entries → fewer misses
- Compact data structures
- Memory pools that reduce fragmentation

---

## NUMA (Non-Uniform Memory Access)

On multi-socket servers, each CPU socket has its own attached memory. Accessing remote socket's memory is 2–3× slower.

```
Socket 0 cores → Socket 0 memory: 100 ns (local)
Socket 0 cores → Socket 1 memory: 200-300 ns (remote)
```

Database servers, large-memory caches, and HPC workloads pin threads + memory to the same NUMA node. Linux: `numactl --cpunodebind=0 --membind=0`.

---

## Pre-fetching

Modern CPUs detect linear access patterns and pre-fetch the next cache line(s) before you ask. Sequential scans benefit; random access defeats the prefetcher.

```c
for (int i = 0; i < N; i++) sum += arr[i];      // prefetcher predicts perfectly
for (int i = 0; i < N; i++) sum += arr[hash(i)]; // every access is a surprise
```

This explains why sequential I/O on disks is 100× faster than random I/O — same principle, different layer.

---

## Memory bandwidth as a bottleneck

DDR5 RAM: ~50 GB/s per channel. A modern CPU can saturate this.

Implications:

- Some workloads are memory-bound, not CPU-bound
- Wider memory paths (more channels, higher frequency) matter
- Compression that reduces bytes-touched can speed CPU-bound code (e.g., columnar databases)

```
Reading 100 GB sequentially:
  At 50 GB/s → 2 seconds floor
  No matter how fast your CPU is
```

---

## Implications across the stack

| Layer | Implication |
|---|---|
| Algorithms | Cache-friendly data structures (arrays, B-trees) over pointer-chasing (linked lists, BSTs) |
| Concurrency | Avoid false sharing; pad shared atomic counters |
| Databases | Page sizes, columnar layouts, compression all leverage memory hierarchy |
| Systems | NUMA pinning, huge pages for high-memory workloads |
| Networking | Zero-copy techniques (sendfile, splice) avoid bouncing through CPU caches |
| Caching | Why CDN edges matter — last hop in the same hierarchy |

---

## Practical numbers to remember

```
L1 cache hit:           1 ns
L2 cache hit:           4 ns
L3 cache hit:           10 ns
Main memory access:     100 ns
NVMe SSD random read:   100 µs    = 1000× RAM
Network round trip:     500 µs    = 5000× RAM
Spinning disk seek:     10 ms     = 100,000× RAM
```

Anything you can keep in L1/L2 is "free." Anything that requires DRAM costs roughly 100×. Anything from disk costs 100,000×. Network adds another order of magnitude on top.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you understand *why* operations cost what they cost — not just memorise numbers.

**Strong answer pattern:**
1. Hierarchy: register → L1 → L2 → L3 → DRAM → SSD → disk → network
2. Each level ~10× larger and slower; cache lines are 64 bytes
3. Algorithms that exploit locality (arrays, B-trees) beat ones that don't (linked lists, BSTs) regardless of Big-O
4. False sharing in concurrent code; pad atomic counters
5. NUMA matters at multi-socket scale; pin threads + memory

**Common follow-up:** *"Why does sequential I/O outperform random I/O even on SSDs?"*
> Same principle as CPU caches at a different layer. SSDs have internal page sizes (typically 4-16 KB); a sequential read fills a page once and serves many requests. Random reads cost a page fault per request. Plus, the SSD controller pre-fetches sequential pages just like the CPU prefetcher. Same phenomenon, three orders of magnitude bigger.

---

## Related topics

- [Numbers Every Engineer Should Know](numbers-to-know.md) — concrete latency numbers from this hierarchy
- [Disk and SSD Internals](disk-ssd-internals.md) — the layer below DRAM
- [Storage Engine Internals](storage-internals.md) — how databases exploit hierarchy (B-trees, LSM)
- [Concurrency & Locking](concurrency.md) — false sharing and memory ordering
- [Memory Models & Cache Coherency](memory-models.md) — how multi-core CPUs keep caches consistent
