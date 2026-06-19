---
title: Fundamentals
---

<div class="sec-hero">
  <span class="ey">Foundations · the bedrock</span>
  <h1>Fundamentals</h1>
  <p>The concepts every other section builds on — numbers, hardware, OS, networking, data structures, distributed theory. Without working intuition here, every higher-level decision (which database, which cache, which protocol) is guessing.</p>
</div>

<div class="roadmap">
  <div class="rm-head">
    <span class="h">🧭 Fundamentals roadmap</span>
    <span class="legend">
      <i><span class="sw core"></span>core path</i>
      <i><span class="sw opt"></span>read as needed</i>
      <i><span class="sw adv"></span>advanced / later</i>
    </span>
  </div>
  <p class="rm-sub">Follow the spine top-to-bottom your first time. Branches hang off the topic they support — grab them when you need them.</p>
  <div class="rm-track">
    <div class="rm-stop">
      <a class="rm-node" href="numbers-to-know/"><span class="n">1</span>Numbers to Know</a>
      <div class="rm-branch right"><a class="rm-chip" href="time-complexity/">Time Complexity</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip adv" href="queuing-theory/">Queuing Theory</a></div>
      <a class="rm-node" href="latency-throughput/"><span class="n">2</span>Latency vs Throughput</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="estimation/"><span class="n">3</span>Estimation</a>
      <div class="rm-branch right"><a class="rm-chip" href="networking-basics/">Networking Basics</a><a class="rm-chip" href="hashing/">Hashing</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="acid-vs-base/">ACID vs BASE</a></div>
      <a class="rm-node" href="cap-theorem/"><span class="n">4</span>CAP Theorem</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="consistency-models/"><span class="n">5</span>Consistency Models</a>
      <div class="rm-branch right"><a class="rm-chip" href="isolation-levels/">Isolation Levels</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip adv" href="memory-hierarchy/">Memory Hierarchy</a><a class="rm-chip adv" href="storage-internals/">Storage Internals</a></div>
      <a class="rm-node" href="scalability/"><span class="n">6</span>Scalability</a>
    </div>
  </div>
</div>

<div class="theme">
  <div class="th"><h2>Numbers &amp; Estimation</h2><span class="rule"></span></div>
  <p class="blurb">Quick math, latency intuition, and the throughput / queueing principles that underpin all capacity decisions.</p>
  <div class="pages">
    <a class="pcard" href="numbers-to-know/"><span class="t">Numbers Every Engineer Should Know</span><span class="d">Latency reference table — RAM, SSD, disk, network</span></a>
    <a class="pcard" href="latency-throughput/"><span class="t">Latency vs Throughput</span><span class="d">The tension that shapes most design choices</span></a>
    <a class="pcard" href="queuing-theory/"><span class="t">Queuing Theory &amp; Little's Law</span><span class="d">Why systems get slow before they fail</span></a>
    <a class="pcard" href="estimation/"><span class="t">Back-of-Envelope Estimation</span><span class="d">QPS, storage, bandwidth on a napkin</span></a>
    <a class="pcard" href="time-complexity/"><span class="t">Time Complexity Cheatsheet</span><span class="d">Big-O for the data structures you actually use</span></a>
  </div>
</div>

<div class="theme">
  <div class="th"><h2>Hardware &amp; OS</h2><span class="rule"></span></div>
  <p class="blurb">The layer beneath your runtime. Memory hierarchy explains every latency number; the OS layer explains every weird performance issue.</p>
  <div class="pages">
    <a class="pcard" href="memory-hierarchy/"><span class="t">Memory Hierarchy &amp; Cache Lines</span><span class="d">Why locality dominates Big-O in practice</span></a>
    <a class="pcard" href="disk-ssd-internals/"><span class="t">Disk and SSD Internals</span><span class="d">Sequential vs random; fsync; write amplification</span></a>
    <a class="pcard" href="os-concepts/"><span class="t">Operating System Concepts</span><span class="d">Processes, threads, syscalls, page cache, FDs</span></a>
    <a class="pcard" href="memory-models/"><span class="t">Memory Models &amp; Cache Coherency</span><span class="d">Why concurrent code is hard; happens-before</span></a>
  </div>
</div>

<div class="theme">
  <div class="th"><h2>Networking</h2><span class="rule"></span></div>
  <p class="blurb">The wire and what runs over it. Most distributed-systems performance issues trace back here.</p>
  <div class="pages">
    <a class="pcard" href="networking-basics/"><span class="t">Networking Basics</span><span class="d">OSI, IP, TCP/UDP at a glance</span></a>
    <a class="pcard" href="tcp-udp-deep-dive/"><span class="t">TCP/UDP Deep Dive</span><span class="d">Handshake, slow start, head-of-line blocking</span></a>
    <a class="pcard" href="tls-certificates/"><span class="t">TLS and Certificates</span><span class="d">Handshake, PKI, mTLS, modern best practices</span></a>
  </div>
</div>

<div class="theme">
  <div class="th"><h2>Data</h2><span class="rule"></span></div>
  <p class="blurb">Encoding, hashing, compression, indexing, storage internals, probabilistic structures. Everything about representing and accessing data.</p>
  <div class="pages">
    <a class="pcard" href="hashing/"><span class="t">Hashing</span><span class="d">Three families: non-crypto, crypto, password</span></a>
    <a class="pcard" href="compression/"><span class="t">Compression</span><span class="d">gzip, zstd, brotli, lz4 — when each wins</span></a>
    <a class="pcard" href="encoding-pitfalls/"><span class="t">Encoding Pitfalls</span><span class="d">Endianness, UTF-8, Base64, varints</span></a>
    <a class="pcard" href="serialization/"><span class="t">Data Encoding &amp; Serialization</span><span class="d">JSON, Protobuf, Avro, MessagePack</span></a>
    <a class="pcard" href="probabilistic-data-structures/"><span class="t">Probabilistic Data Structures</span><span class="d">Bloom filters, HyperLogLog</span></a>
    <a class="pcard" href="database-indexes/"><span class="t">Database Indexes</span><span class="d">B-tree, hash, partial, composite</span></a>
    <a class="pcard" href="storage-internals/"><span class="t">Storage Engine Internals</span><span class="d">B-tree vs LSM-tree internals</span></a>
  </div>
</div>

<div class="theme">
  <div class="th"><h2 id="reliability-consistency-theory">Reliability &amp; Consistency Theory</h2><span class="rule"></span></div>
  <p class="blurb">The properties and constraints that govern multi-node systems. For the mechanisms that implement them — consensus, leader election, locks, clocks, CRDTs — see <a href="../distributed/">Distributed Systems</a>.</p>
  <div class="pages">
    <a class="pcard" href="acid-vs-base/"><span class="t">ACID vs BASE</span><span class="d">Two transactional models</span></a>
    <a class="pcard" href="cap-theorem/"><span class="t">CAP Theorem</span><span class="d">The C/A choice during partitions</span></a>
    <a class="pcard" href="consistency-models/"><span class="t">Consistency Models</span><span class="d">Strong → eventual and the spectrum between</span></a>
    <a class="pcard" href="isolation-levels/"><span class="t">Database Transactions &amp; Isolation</span><span class="d">Read committed, snapshot, serializable, write skew</span></a>
    <a class="pcard" href="scalability/"><span class="t">Scalability</span><span class="d">Horizontal vs vertical; bottlenecks</span></a>
    <a class="pcard" href="throughput-limits/"><span class="t">Throughput Limits (Amdahl's &amp; USL)</span><span class="d">Why doubling cores doesn't double throughput</span></a>
    <a class="pcard" href="availability/"><span class="t">Availability &amp; Reliability</span><span class="d">9s, MTBF, MTTR</span></a>
    <a class="pcard" href="fault-tolerance/"><span class="t">Fault Tolerance &amp; Resilience</span><span class="d">Designing for failure</span></a>
    <a class="pcard" href="failure-modes/"><span class="t">Failure Modes Catalogue</span><span class="d">Crash, omission, gray failure, cascading</span></a>
    <a class="pcard" href="concurrency/"><span class="t">Concurrency &amp; Locking</span><span class="d">Mutexes, atomics, lock-free patterns</span></a>
    <a class="pcard" href="hot-partitions/"><span class="t">Hot Partitions &amp; Hotspots</span><span class="d">When sharding doesn't help</span></a>
  </div>
</div>

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

## Reading paths

| If you have... | Read first |
|---|---|
| 30 minutes | numbers-to-know, CAP theorem, latency-throughput |
| 2 hours | + queuing theory, isolation levels, memory hierarchy, hashing |
| A weekend | + everything in Hardware & OS + Reliability & Consistency Theory |

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
