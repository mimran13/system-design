# Fundamentals

The theoretical bedrock every system design decision rests on. Master these before diving into architecture, distributed systems, or case studies — they provide the vocabulary and mental models everything else builds on.

## Network & performance

| Topic | What it is | Why it matters |
|---|---|---|
| [Networking Basics](networking-basics.md) | TCP/IP, DNS, HTTP, TLS from the ground up | Every service communicates over a network — understand the substrate |
| [Numbers Every Engineer Should Know](numbers-to-know.md) | Latency, throughput, and storage reference figures | Fast mental arithmetic for back-of-envelope estimates |
| [Latency vs Throughput](latency-throughput.md) | Why optimizing one can hurt the other | The central trade-off in every performance decision |
| [Queuing Theory & Little's Law](queuing-theory.md) | L = λW and the utilization curve | Why 90% CPU feels broken and how to size any system |
| [Back-of-Envelope Estimation](estimation.md) | QPS, storage, bandwidth calculations | The first thing you do in any system design interview |

## System properties

| Topic | What it is | Why it matters |
|---|---|---|
| [Scalability](scalability.md) | Vertical vs horizontal scaling and their limits | How to grow a system when traffic increases |
| [Availability & Reliability](availability.md) | Nines, SLOs, SLAs, failure budgets | How to reason about and commit to uptime |
| [Fault Tolerance & Resilience](fault-tolerance.md) | Failure modes, redundancy, graceful degradation | Systems fail — know how to contain and recover |
| [Concurrency & Locking](concurrency.md) | Threads, race conditions, deadlocks, async I/O | Most production bugs come from incorrect concurrent access |

## Data guarantees

| Topic | What it is | Why it matters |
|---|---|---|
| [ACID vs BASE](acid-vs-base.md) | The two consistency philosophies behind every DB choice | Explains why you pick SQL vs NoSQL per use case |
| [CAP Theorem](cap-theorem.md) | Consistency vs Availability during a partition | Why distributed DBs make fundamentally different trade-offs |
| [Consistency Models](consistency-models.md) | Linearizable → Sequential → Causal → Eventual | The spectrum between "always fresh" and "eventually synced" |

## Data access & storage

| Topic | What it is | Why it matters |
|---|---|---|
| [Database Indexes](database-indexes.md) | B-tree, composite, covering, partial indexes | The single highest-leverage performance tool in any DB |
| [Storage Engine Internals](storage-internals.md) | LSM trees, WAL, SSTables, compaction, MVCC | Why Cassandra writes fast, why Postgres needs VACUUM |
| [Probabilistic Data Structures](probabilistic-data-structures.md) | Bloom filters, HyperLogLog, Count-Min Sketch | Approximate answers in constant memory — powers Cassandra, Redis, analytics |
| [Data Encoding & Serialization](serialization.md) | JSON vs Protobuf vs Avro, schema evolution | How data moves across services and survives version changes |

---

## Learning order

```
── Network & Performance ─────────────────────────────────────
Networking Basics       ← understand the transport layer first
Numbers to Know         ← calibrate your intuition for scale
Latency vs Throughput   ← the core performance trade-off
Queuing Theory          ← math behind capacity and wait times
Estimation              ← turn numbers into architecture choices

── System Properties ─────────────────────────────────────────
Scalability             ← how to grow the system
Availability            ← how to keep it running
Fault Tolerance         ← how to survive failures
Concurrency             ← how to handle simultaneous access

── Data Guarantees ───────────────────────────────────────────
ACID vs BASE            ← what guarantees does your data store give?
CAP Theorem             ← what happens when nodes can't talk?
Consistency Models      ← how stale can data be?

── Data Access & Storage ─────────────────────────────────────
Database Indexes        ← how to make reads fast
Storage Internals       ← how databases actually store data
Probabilistic Structures← approximate counting and membership
Serialization           ← how data moves across the wire
```
