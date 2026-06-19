---
tags:
  - applied
---

# Practical Examples

Real-world scenarios with the concepts that fit. Each example weaves together 2-4 patterns from across the repo to solve a concrete problem.

This is the **applicative** side of the encyclopedia: not "what is concept X?" but "we have problem Y at work — what fits, why, and what to watch out for?"

These are *short, concept-weaving scenarios*. For full end-to-end system designs (requirements → estimation → architecture → deep dive), see [Case Studies](../case-studies/index.md).

---

## How to use this section

Each scenario follows the same shape:

```
Scenario          ←  the concrete real-world problem
Reasoning         ←  what to think about; the bottleneck; the constraint
Applicable concepts  ←  2-4 concepts with one-line "why this fits"
Sketch            ←  small architecture diagram
Trade-offs        ←  what you give up; what you gain
Anti-patterns     ←  what NOT to do for this scenario
```

Read the scenario → form your own answer → compare with the reasoning. That's the applied-learning loop.

---

## Categories

| Category | Scenarios |
|---|---|
| [Data Processing](data-processing.md) | Large file ingest, ETL pipelines, streaming aggregation, search indexing |
| [Real-Time Systems](real-time-systems.md) | Chat, live notifications, presence/online status, collaborative editing |
| [Payments & Correctness](payments-and-correctness.md) | Idempotent payment, multi-step checkout, refund flow, audit trail |
| [Scaling & Performance](scaling-and-performance.md) | Hot keys, write-heavy workloads, social timeline, search at scale |
| [Multi-Tenant SaaS](multi-tenant-saas.md) | Tenant isolation, noisy neighbour, per-region tenants, billing |
| [Event-Driven Workflows](event-driven-workflows.md) | CQRS in context, event sourcing for audit, saga for order workflow |

---

## When to consult this section

- You're designing a feature and want to see "how would others approach this?"
- You're in a system design interview practising adaptation
- You read a concept page and want to see it applied
- You're staring at a problem and wondering which 2-3 concepts combine
- You want to learn the *combination* skill — concepts rarely apply alone in real systems

---

## When NOT to consult this section

- You want the *theory* of a concept → use the concept's own page
- You want a full system design → use [Case Studies](../case-studies/index.md)
- You have a specific symptom → use [Symptom → Concept Lookup](../reference/symptom-lookup.md)

---

## Format conventions

- **Concrete numbers** wherever possible (10K req/s, 50TB, 100K events/sec). Numbers anchor the trade-offs.
- **Named technologies** (Postgres, Kafka, Redis) — abstract pseudocode wastes space when the answer is a real tool.
- **Multiple valid answers** sometimes; the page lists "Alternative" sections where they exist.
- **Anti-patterns called out** — recognising what NOT to do is half the battle.

---

## Related

- [Case Studies](../case-studies/index.md) — full system designs (URL shortener, news feed, etc.)
- [Symptom → Concept Lookup](../reference/symptom-lookup.md) — diagnostic-first reference
- [Architecture Anti-Patterns](../architecture/anti-patterns.md) — common mistakes to avoid
