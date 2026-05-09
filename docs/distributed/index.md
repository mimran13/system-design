# Distributed Systems

The theory and mechanics behind systems that run across multiple nodes. This is where reliability, consistency, and fault tolerance are won or lost.

---

## Start here: why distributed systems are hard

Before anything else, read [The 8 Fallacies](fallacies.md) — the false assumptions that cause every class of distributed system failure. Every topic in this section exists because one of those fallacies is violated in the real world.

---

## Coordination and agreement

How nodes reach agreement despite failures and network unreliability.

| Topic | What it is | When it matters |
|---|---|---|
| [Consensus (Raft & Paxos)](consensus.md) | How nodes agree on a single value despite failures | Distributed databases, replicated state machines |
| [Leader Election](leader-election.md) | Picking one coordinator and handling its failure | Primary replica selection, job scheduling |
| [Split Brain & Fencing](split-brain.md) | Two leaders both accepting writes — and fencing tokens to stop it | Any system with leader election |
| [Distributed Locks](distributed-locks.md) | Mutual exclusion across processes on different machines | Exactly-once processing, preventing double work |
| [Quorum](quorum.md) | R+W>N — configuring consistency vs availability trade-off | Every distributed DB (Cassandra, DynamoDB, Raft) |
| [Two-Phase Commit](two-phase-commit.md) | Atomic commit across multiple participants | Cross-DB transactions (use sparingly) |

## Consistency and time

Why distributed systems make time and ordering hard, and how to deal with it.

| Topic | What it is | When it matters |
|---|---|---|
| [Clocks & Ordering](clocks.md) | Lamport clocks, vector clocks, why wall clocks lie | Event ordering, causality tracking |
| [Distributed Transactions](distributed-transactions.md) | ACID across multiple services — the full picture | Microservices that span multiple DBs |
| [Exactly-Once Semantics](exactly-once.md) | At-most-once / at-least-once / exactly-once — tradeoffs and implementation | Payments, Kafka consumers, any stateful processing |
| [CRDTs](crdts.md) | Data structures that merge automatically without conflicts | Multi-region writes, collaborative editing, offline-first |

## Membership and discovery

How nodes find each other and detect failures.

| Topic | What it is | When it matters |
|---|---|---|
| [Service Discovery](service-discovery.md) | How services find each other in dynamic environments | Any microservices deployment |
| [Gossip Protocol](gossip.md) | Epidemic information dissemination at scale | Membership management, failure detection |
| [Failure Detection](failure-detection.md) | Heartbeats, phi accrual, cost of false positives | Any system requiring liveness detection |

## Algorithms and data structures

Space-efficient probabilistic structures that power real distributed systems.

| Topic | What it is | When it matters |
|---|---|---|
| [Distributed Primitives](distributed-primitives.md) | Bloom filter, Merkle tree, HyperLogLog, Count-Min Sketch | Cassandra internals, Redis, analytics, crawlers |

---

## Concept map

```
The 8 Fallacies
  ├── Network fails              → Failure Detection, Circuit Breaker
  ├── Latency is non-zero        → Quorum trade-offs, async replication
  ├── Topology changes           → Service Discovery, Gossip
  └── Clocks drift               → Lamport Clocks, Vector Clocks, CRDTs

CAP Theorem (consistency vs availability)
  ├── CP path  → Consensus (Raft/Paxos) → Leader Election → Distributed Locks
  └── AP path  → Quorum (R+W>N tunable) → CRDTs → Eventual Consistency

Distributed Transactions
  ├── Strong path → Two-Phase Commit (blocking, avoid in microservices)
  └── Weak path   → Saga Pattern (see Patterns section) + Idempotency

Data synchronization
  └── Merkle Trees → Gossip Protocol → Cassandra anti-entropy repair
```
