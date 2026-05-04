# Fundamentals

Core theory that underpins every system design decision. These are the concepts you'll reference across every other section.

## Data consistency

| Topic | What it is | Why it matters |
|---|---|---|
| [ACID vs BASE](acid-vs-base.md) | The two consistency philosophies behind every DB choice | Explains why you pick SQL vs NoSQL per use case |
| [CAP Theorem](cap-theorem.md) | Consistency vs Availability during a partition | Why distributed DBs make different trade-offs |
| [Consistency Models](consistency-models.md) | Linearizable → Sequential → Causal → Eventual | The spectrum between "always fresh" and "eventually synced" |

## System properties

| Topic | What it is | Why it matters |
|---|---|---|
| [Scalability](scalability.md) | Vertical vs horizontal scaling, and their limits | How to grow a system when traffic increases |
| [Availability & Reliability](availability.md) | Nines, SLOs, SLAs, failure budgets | How to reason about and commit to uptime |
| [Latency vs Throughput](latency-throughput.md) | Why optimizing one can hurt the other | Trade-offs in every performance decision |
| [Back-of-Envelope Estimation](estimation.md) | QPS, storage, bandwidth calculations | The first thing you do in any system design interview |

## Learning order

```
ACID vs BASE        ← what guarantees does your data store give?
CAP Theorem         ← what happens when nodes can't communicate?
Consistency Models  ← how stale can data be before it's a problem?
Scalability         ← how do you grow the system?
Availability        ← how do you keep it running when things fail?
Latency/Throughput  ← how do you keep it fast?
Estimation          ← how do you size it before you build it?
```
