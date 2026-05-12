# Reading Path: Interview Prep (1 Week)

25 pages covering the canon for senior+ backend / distributed systems / staff-level system design interviews. Designed as **one week of ~1 hour daily**, plus practice problems on the weekend.

If you've never done a system design interview, do the [Essentials path](essentials.md) first — this assumes you already have the basics.

---

## Why these 25

System design interviews probe a specific shape of knowledge: can you reason about scale, trade-offs, and failure modes *under pressure*? The pages here are chosen for **frequency of appearance** in real interviews + **likelihood of being a follow-up question**.

Estimated time: **~7 hours of reading + 3 hours of practice = ~10 hours total**.

---

## Day 1 — Foundations (1 hour)

Calibrate intuition. Every later question references these numbers and trade-offs.

| # | Page | Why for interviews |
|---|---|---|
| 1 | [Numbers Every Engineer Should Know](../fundamentals/numbers-to-know.md) | You'll be asked "how big is this dataset?" — knowing 1GB ≈ 30s sequential disk read shapes everything |
| 2 | [Back-of-Envelope Estimation](../fundamentals/estimation.md) | First 10 minutes of every interview |
| 3 | [Latency vs Throughput](../fundamentals/latency-throughput.md) | The trade-off interviewers probe most |

## Day 2 — Distributed systems theory (1 hour)

The vocabulary the interviewer expects you to share.

| # | Page | Why for interviews |
|---|---|---|
| 4 | [CAP Theorem](../fundamentals/cap-theorem.md) | The "explain CAP" question is a warmup; nail it |
| 5 | [Consistency Models](../fundamentals/consistency-models.md) | "Strong" vs "eventual" — interviewers expect you to nuance this |
| 6 | [ACID vs BASE](../fundamentals/acid-vs-base.md) | Why your database choice has implications |
| 7 | [Database Transactions & Isolation](../fundamentals/isolation-levels.md) | Senior-level: write skew, snapshot isolation, when it matters |

## Day 3 — Storage and scale (1 hour)

The "what database?" question is unavoidable. So is "how does it scale?"

| # | Page | Why for interviews |
|---|---|---|
| 8 | [SQL vs NoSQL](../storage/sql-vs-nosql.md) | The first major decision in any design |
| 9 | [Sharding](../patterns/sharding.md) | "How do you scale writes?" — sharding strategies |
| 10 | [Hot Partitions & Hotspots](../fundamentals/hot-partitions.md) | Standard follow-up: "what if one shard gets hot?" |
| 11 | [Consistent Hashing](../patterns/consistent-hashing.md) | "How do you add a node without moving all keys?" |

## Day 4 — Caching and performance (1 hour)

The fastest way to scale reads. Interviewers expect you to reach for caching.

| # | Page | Why for interviews |
|---|---|---|
| 12 | [Caching Strategies](../caching/caching-strategies.md) | Cache-aside vs read-through vs write-through — know when each |
| 13 | [Cache Patterns & Pitfalls](../caching/cache-patterns.md) | Cache stampede, hot keys — likely follow-up |
| 14 | [Database Indexes](../fundamentals/database-indexes.md) | "Why is this query slow?" → index missing 80% of the time |

## Day 5 — Reliability (1 hour)

Senior-level interviews test whether you can reason about failure, not just happy paths.

| # | Page | Why for interviews |
|---|---|---|
| 15 | [Failure Modes Catalogue](../fundamentals/failure-modes.md) | Gray failure, cascading failure — senior-level vocabulary |
| 16 | [Circuit Breaker](../patterns/circuit-breaker.md) | The standard answer to "what if X is slow?" |
| 17 | [Retry & Timeout](../patterns/retry-timeout.md) | + backoff with jitter — the trinity for resilience |
| 18 | [Idempotency](../patterns/idempotency.md) | The pattern interviewers expect you to apply *unprompted* |

## Day 6 — Messaging and async (1 hour)

Any system at scale has async work. Know the trade-offs.

| # | Page | Why for interviews |
|---|---|---|
| 19 | [Message Queues](../messaging/message-queues.md) | Decoupling producers from consumers |
| 20 | [Pub/Sub](../messaging/pub-sub.md) | Fan-out scenarios — chat, notifications |
| 21 | [Event Streaming (Kafka)](../messaging/event-streaming.md) | When you need replay + ordering |
| 22 | [Saga Pattern](../patterns/saga-pattern.md) | "How do you handle multi-step transactions across services?" |

## Day 7 — Architecture and patterns (1 hour)

The big-picture decisions.

| # | Page | Why for interviews |
|---|---|---|
| 23 | [Monolith vs Microservices](../architecture/monolith-vs-microservices.md) | Have an opinion; defend it |
| 24 | [Event-Driven Architecture](../architecture/event-driven.md) | The common follow-up after sagas |
| 25 | [CQRS](../patterns/cqrs.md) | "How would you scale reads independently of writes?" |

---

## Weekend — Practice (3+ hours)

Apply what you've read. Pick 2-3 case studies and work through them on paper *before* reading the solutions.

| Problem | Page | Why |
|---|---|---|
| URL Shortener | [Case Study](../case-studies/url-shortener.md) | Classic warmup — covers hashing, caching, scale |
| Twitter / News Feed | [Case Study](../case-studies/twitter.md) | Fan-out trade-offs, celebrity problem |
| Rate Limiter | [Case Study](../case-studies/rate-limiter.md) | Token bucket, sliding window, distributed counters |
| Chat System | [Case Study](../case-studies/chat-system.md) | WebSockets, pub/sub, ordering |
| Distributed Cache | [Case Study](../case-studies/distributed-cache.md) | Consistent hashing, replication, eviction |

Also work through 2-3 [Practical Examples](../examples/index.md) — they're shaped like interview follow-up questions.

---

## Interview framework to use

Every system design interview should follow roughly:

```
1. Clarify requirements (5-10 min)
   - Functional: what should it do?
   - Non-functional: scale, latency, consistency
   - Out of scope: what we're NOT building

2. Estimate scale (5-10 min)
   - DAU, QPS, storage, bandwidth
   - Pick a target (10M users, 10K QPS, etc.)

3. High-level design (10-15 min)
   - Components: clients, API, services, datastores, caches, queues
   - Data flow at a high level

4. Deep dive (15-20 min)
   - Pick 2-3 components to detail
   - Database schema, sharding, caching, hot partitions
   - Address the trade-offs the interviewer probes

5. Wrap up (5 min)
   - Acknowledge limitations
   - "If we had more time, I'd also consider..."
```

See the [Interview Guide](../interview-guide.md) for more on this framework.

---

## What you'll be able to do after this path

```
First 10 minutes
─ Clarify requirements and estimate scale comfortably
─ Pick a primary data store with a defensible reason

Mid-interview
─ Recognise standard follow-ups (hot partition, cache stampede, retry storm)
─ Reach for the right pattern (idempotency, circuit breaker, saga, CQRS)

End game
─ Reason about failure scenarios without being prompted
─ Quantify trade-offs ("this costs 2× the read latency for stronger consistency")
─ Know what you're NOT addressing and say so
```

---

## What's next

After interviews:

- [Building a SaaS path](building-saas.md) — apply this knowledge to a real product
- [Practical Examples](../examples/index.md) — see concepts combined in scenarios
- Specific case studies in [Case Studies](../case-studies/index.md)

---

## Related

- [Interview Guide](../interview-guide.md) — the meta-framework and what interviewers look for
- [Symptom → Concept Lookup](../reference/symptom-lookup.md) — when you forget a concept's name
- [Decision Flowcharts](../reference/decision-flowcharts.md) — for "which would you pick?" questions
