# Fundamentals

The bedrock concepts that every other section builds on. Numbers, hardware, OS, networking, data structures, distributed systems theory. If you don't have working intuition for these, every higher-level decision (which database, which cache, which protocol) is guessing.

This section is grouped into five themes — read top-to-bottom for first time, or jump to the theme that matches your current question.

## Suggested reading order

New to this topic? Read these in order — each builds on the previous:

1. [Numbers Every Engineer Should Know](numbers-to-know.md) — latency intuition is the foundation for every other judgment call
2. [Latency vs Throughput](latency-throughput.md) — the core tension behind most design trade-offs
3. [Back-of-Envelope Estimation](estimation.md) — turn those numbers into QPS, storage, and bandwidth sizing
4. [CAP Theorem](cap-theorem.md) — the constraint that shapes every distributed-system choice
5. [ACID vs BASE](acid-vs-base.md) — the two transactional worldviews you'll choose between
6. [Consistency Models](consistency-models.md) — the full spectrum between strong and eventual
7. [Database Transactions & Isolation](isolation-levels.md) — what databases actually guarantee under concurrency
8. [Scalability](scalability.md) — horizontal vs vertical, and where bottlenecks hide

**Then, as needed (reference):** [Networking Basics](networking-basics.md), [Hashing](hashing.md), [Time Complexity Cheatsheet](time-complexity.md), [Data Encoding & Serialization](serialization.md), [Compression](compression.md), [Database Indexes](database-indexes.md), [Operating System Concepts](os-concepts.md), [TLS and Certificates](tls-certificates.md)

**Advanced — come back later:** [Queuing Theory & Little's Law](queuing-theory.md), [Throughput Limits (Amdahl's & USL)](throughput-limits.md), [Memory Hierarchy & Cache Lines](memory-hierarchy.md), [Memory Models & Cache Coherency](memory-models.md), [Concurrency & Locking](concurrency.md), [Storage Engine Internals](storage-internals.md), [Failure Modes Catalogue](failure-modes.md), [Hot Partitions & Hotspots](hot-partitions.md), [CAP Theorem Applied](cap-theorem-applied.md)

---

## Numbers & Estimation

Quick math, latency intuition, and the throughput / queueing principles that underpin all capacity decisions.

| Topic | What it covers |
|---|---|
| [Numbers Every Engineer Should Know](numbers-to-know.md) | Latency reference table — RAM, SSD, disk, network |
| [Latency vs Throughput](latency-throughput.md) | The tension that shapes most design choices |
| [Queuing Theory & Little's Law](queuing-theory.md) | Why systems get slow before they fail |
| [Back-of-Envelope Estimation](estimation.md) | QPS, storage, bandwidth on a napkin |
| [Time Complexity Cheatsheet](time-complexity.md) | Big-O for the data structures you actually use |

---

## Hardware & OS

The layer beneath your runtime. Memory hierarchy explains every latency number; the OS layer explains every weird performance issue.

| Topic | What it covers |
|---|---|
| [Memory Hierarchy & Cache Lines](memory-hierarchy.md) | Why locality dominates Big-O in practice |
| [Disk and SSD Internals](disk-ssd-internals.md) | Sequential vs random; fsync; write amplification |
| [Operating System Concepts](os-concepts.md) | Processes, threads, syscalls, page cache, FDs |
| [Memory Models & Cache Coherency](memory-models.md) | Why concurrent code is hard; happens-before |

---

## Networking

The wire and what runs over it. Most distributed-systems performance issues trace back here.

| Topic | What it covers |
|---|---|
| [Networking Basics](networking-basics.md) | OSI, IP, TCP/UDP at a glance |
| [TCP/UDP Deep Dive](tcp-udp-deep-dive.md) | Handshake, slow start, head-of-line blocking |
| [TLS and Certificates](tls-certificates.md) | Handshake, PKI, mTLS, modern best practices |

---

## Data

Encoding, hashing, compression, indexing, storage internals, probabilistic structures. Everything about representing and accessing data.

| Topic | What it covers |
|---|---|
| [Hashing](hashing.md) | Three families: non-crypto, crypto, password |
| [Compression](compression.md) | gzip, zstd, brotli, lz4 — when each wins |
| [Encoding Pitfalls](encoding-pitfalls.md) | Endianness, UTF-8, Base64, varints |
| [Data Encoding & Serialization](serialization.md) | JSON, Protobuf, Avro, MessagePack |
| [Probabilistic Data Structures](probabilistic-data-structures.md) | Bloom filters, HyperLogLog |
| [Database Indexes](database-indexes.md) | B-tree, hash, partial, composite |
| [Storage Engine Internals](storage-internals.md) | B-tree vs LSM-tree internals |

---

## Distributed Systems Theory

The properties and constraints that govern multi-node systems.

| Topic | What it covers |
|---|---|
| [ACID vs BASE](acid-vs-base.md) | Two transactional models |
| [CAP Theorem](cap-theorem.md) | The C/A choice during partitions |
| [Consistency Models](consistency-models.md) | Strong → eventual and the spectrum between |
| [Database Transactions & Isolation](isolation-levels.md) | Read committed, snapshot, serializable, write skew |
| [Scalability](scalability.md) | Horizontal vs vertical; bottlenecks |
| [Throughput Limits (Amdahl's & USL)](throughput-limits.md) | Why doubling cores doesn't double throughput |
| [Availability & Reliability](availability.md) | 9s, MTBF, MTTR |
| [Fault Tolerance & Resilience](fault-tolerance.md) | Designing for failure |
| [Failure Modes Catalogue](failure-modes.md) | Crash, omission, gray failure, cascading |
| [Concurrency & Locking](concurrency.md) | Mutexes, atomics, lock-free patterns |
| [Hot Partitions & Hotspots](hot-partitions.md) | When sharding doesn't help |

---

## Reading paths

| If you have... | Read first |
|---|---|
| 30 minutes | numbers-to-know, CAP theorem, latency-throughput |
| 2 hours | + queuing theory, isolation levels, memory hierarchy, hashing |
| A weekend | + everything in Hardware & OS + Distributed Systems Theory |

---

## Interview shortlist

| Question | Section |
|---|---|
| *"What's the latency of a memory access vs a disk read?"* | Numbers, Memory Hierarchy |
| *"Explain CAP."* | CAP Theorem |
| *"What's the difference between read committed and serializable?"* | Isolation Levels |
| *"Why does TCP take a round trip before sending data?"* | TCP Deep Dive |
| *"What's a bloom filter and where would you use one?"* | Probabilistic Data Structures |
| *"Why doesn't doubling the servers double the throughput?"* | Throughput Limits |
| *"What's gray failure?"* | Failure Modes |
| *"How does a hash map handle collisions?"* | Hashing, Time Complexity |
