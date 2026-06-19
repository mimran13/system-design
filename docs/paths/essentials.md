# Reading Path: Just the Essentials

The 12 foundational concepts every backend engineer should know cold. If you only ever read 12 pages from this encyclopedia, **these** are the 12. About 3 hours of focused reading total.

The order matters — each builds on the previous.

---

## Why these 12

This path skips depth, history, and edge cases. It's the **minimum viable model** of how distributed systems work. After this, every other concept on the site fits into a context you understand.

Estimated time: 10-20 minutes per page = **~3 hours total**.

---

## The path

### Layer 1: Calibrate your intuition (45 min)

| # | Page | Why it's here |
|---|---|---|
| 1 | [Numbers Every Engineer Should Know](../fundamentals/numbers-to-know.md) | Concrete latency ranges. Every architectural decision rests on knowing RAM is 1000× faster than disk, network round-trip is ~500µs intra-DC. |
| 2 | [Latency vs Throughput](../fundamentals/latency-throughput.md) | The trade-off behind most performance choices. They're not the same thing. |
| 3 | [Back-of-Envelope Estimation](../fundamentals/estimation.md) | QPS, storage, bandwidth on a napkin. The first thing you do in any system design conversation. |

### Layer 2: Distributed systems theory (45 min)

| # | Page | Why it's here |
|---|---|---|
| 4 | [CAP Theorem](../fundamentals/cap-theorem.md) | The universal trade-off when partitions happen. CP vs AP. |
| 5 | [Consistency Models](../fundamentals/consistency-models.md) | Strong → eventual and everything in between. Why "DynamoDB returned stale data" isn't a bug. |
| 6 | [ACID vs BASE](../fundamentals/acid-vs-base.md) | The two transactional philosophies that drive database choice. |

### Layer 3: Reliability and failure (40 min)

| # | Page | Why it's here |
|---|---|---|
| 7 | [Availability & Reliability](../fundamentals/availability.md) | What 99.9% actually buys you. SLO basics. |
| 8 | [Failure Modes Catalogue](../fundamentals/failure-modes.md) | Production doesn't fail clean. Gray failure, cascading failure, timing failure — recognise them. |

### Layer 4: The two patterns you'll reach for most (35 min)

| # | Page | Why it's here |
|---|---|---|
| 9 | [Idempotency](../patterns/idempotency.md) | Networks fail, clients retry. Without idempotency, you double-charge. The single most important pattern in distributed systems. |
| 10 | [Caching Strategies](../caching/caching-strategies.md) | The single highest-leverage performance tool. Cache-aside, write-through, write-back, when each applies. |

### Layer 5: Data and architecture choices (35 min)

| # | Page | Why it's here |
|---|---|---|
| 11 | [SQL vs NoSQL](../storage/sql-vs-nosql.md) | The first big decision in any new system. When SQL is right, when NoSQL is, when each is overkill. |
| 12 | [Monolith vs Microservices](../architecture/monolith-vs-microservices.md) | The other big decision. With a third answer most teams should hear: modular monolith. |

---

## What you'll know after this path

```
Order of magnitude intuition for cost of operations
─ Disk vs RAM vs network: known
─ "Can this scale?" — you have a quick check

Distributed systems vocabulary
─ Strong/eventual consistency: clear
─ CAP and what it actually means
─ Why "exactly once" is hard

Failure thinking
─ Idempotent operations are the default for anything across network
─ Production failures are partial, slow, lying — you recognise them

Architecture defaults
─ SQL until you can't; NoSQL when you know why
─ Modular monolith first; microservices when team/scale forces it
```

---

## What's next

After this path, three good directions:

| Direction | Read next |
|---|---|
| **Build something real** | [Building a SaaS path](building-saas.md) |
| **Prep for interviews** | [Interview Prep path](interview-prep.md) |
| **Go deeper on a specific area** | [Browse by Topic](../index.md#or-browse-by-topic) on the home page |

Or jump to [Symptom → Concept Lookup](../reference/symptom-lookup.md) when you next hit a problem at work — the encyclopedia is built to be reached for, not read end-to-end.

---

## Related

- [Reading paths overview](index.md)
- [Practical Examples](../examples/index.md) — once you know the concepts, see them combined
- [Glossary](../glossary.md) — one-line refresher of any term
