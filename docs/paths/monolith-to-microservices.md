# Reading Path: Monolith → Microservices

15 pages for the migration journey. Covers when you should (and shouldn't), how to do it without big-bang rewrites, the patterns you'll need, and the pitfalls that turn a microservices project into a distributed monolith.

Aimed at: tech leads, staff engineers, architects considering or executing a migration. Assumes you've done the [Essentials path](essentials.md).

---

## Why this path matters

Most "monolith → microservices" projects fail. Not because microservices are bad — but because they're adopted for the wrong reasons, at the wrong scale, or executed as a big-bang rewrite. This path covers all three failure modes.

Estimated time: **~4 hours of reading**.

---

## Phase 1: Decide if you should (1 hour)

Before any code changes, get honest about whether you're solving the right problem.

| # | Page | Why for migration |
|---|---|---|
| 1 | [Monolith vs Microservices](../architecture/monolith-vs-microservices.md) | The strategic decision and what actually drives it |
| 2 | [Modular Monolith](../architecture/modular-monolith.md) | The "third option" most teams should consider first |
| 3 | [Architecture Anti-Patterns](../architecture/anti-patterns.md) | "Premature microservices" and "distributed monolith" especially |

**Common drivers that justify microservices**: team size 50+ engineers, independent deploy cadence per service, different scaling profiles per service, polyglot stack mandated.

**Common drivers that DON'T justify microservices**: "monolith is messy" (modular monolith fixes that), "Netflix does it" (you're not Netflix), "performance" (rarely the real bottleneck).

---

## Phase 2: Foundations to get right first (1 hour)

The boring foundational work that makes migration possible.

| # | Page | Why for migration |
|---|---|---|
| 4 | [Hexagonal Architecture](../architecture/hexagonal.md) | Decouples domain from infrastructure — prerequisite to splitting |
| 5 | [Domain-Driven Design](../architecture/ddd.md) | Bounded contexts define where to split |
| 6 | [Coupling & Cohesion at Service Boundaries](../architecture/coupling-cohesion-services.md) | What makes a service stand on its own |
| 7 | [Twelve-Factor App](../architecture/twelve-factor.md) | Without this, services can't be deployed independently |

---

## Phase 3: The migration approach (45 min)

How to migrate without rewriting everything.

| # | Page | Why for migration |
|---|---|---|
| 8 | [Strangler Fig Pattern](../architecture/strangler-fig.md) | The fundamental migration technique. No big-bang rewrites. |
| 9 | [Evolutionary Architecture](../architecture/evolutionary-architecture.md) | Fitness functions to prevent regression during migration |
| 10 | [API Versioning at Architecture Level](../architecture/api-versioning-architecture.md) | How services evolve their contracts |

---

## Phase 4: Inter-service patterns you'll need (1 hour)

The new patterns that emerge once services exist.

| # | Page | Why for migration |
|---|---|---|
| 11 | [Microservices Patterns](../architecture/microservices-patterns.md) | Service discovery, API gateway, sidecars, mesh |
| 12 | [Event-Driven Architecture](../architecture/event-driven.md) | The async backbone that makes services loosely coupled |
| 13 | [Saga Pattern](../patterns/saga-pattern.md) | Multi-step transactions across services |
| 14 | [Outbox Pattern](../patterns/outbox.md) | DB write + event publish must be atomic |
| 15 | [Choreography vs Orchestration](../architecture/choreography-vs-orchestration.md) | How services coordinate workflows |

---

## The strangler fig in practice

```
Step 1: Identify the seam
  Find a bounded context with clear inputs / outputs.
  Usually: highest rate-of-change × highest team friction.
  
Step 2: Wrap the existing implementation behind an interface
  Internal: introduce a port/adapter for the area.
  External: keep clients using the same API.
  
Step 3: Build the new service in parallel
  New service implements the interface.
  Still empty / minimal at first.
  
Step 4: Migrate one operation at a time
  Read endpoint first (lower risk than write).
  Old monolith still has the implementation; new service forwards or owns.
  
Step 5: Shift writes
  Feature-flag controls whether traffic goes to monolith or new service.
  Start at 1% → 10% → 50% → 100%.
  
Step 6: Decommission the old implementation
  Once new service handles 100% for ~30 days, delete old code.
  
Move to next service.
Total elapsed: weeks to months per service, not days.
```

Crucially: **at every step, the system works**. Reversible. Auditable.

---

## What to extract first — the priority order

```
1. The most painful coupling
   What change always touches 5+ teams? Extract that first.

2. Services with very different scaling profiles
   "ML inference" or "background processing" — naturally cohesive, independent scaling.

3. New functionality
   New features go straight to a service; don't grow the monolith.

4. Stable, well-understood areas (LAST)
   Tempting to extract the easy parts first; resist. They're not solving any problem.
```

---

## Anti-patterns to avoid (the famous failures)

### The distributed monolith

Services exist, but every change touches multiple ones; deploys must be coordinated; one slow service brings the others down.

**Signs**: PRs touch 4+ repos; "we need to release A and B together"; outage in one service cascades to many.

**Fix**: reduce coupling, not split further. Sometimes: merge tightly coupled services.

### Premature microservices

10-person team running 30 services. Ops cost dominates. Velocity slows.

**Fix**: merge until count matches team's operational capacity.

### Shared database (the worst form)

Two services read each other's tables. Schema changes ripple.

**Fix**: each service owns its data; cross-service access via API.

### Big-bang rewrite

"We'll rewrite the whole monolith over 18 months." Almost always fails.

**Fix**: strangler fig. Replace incrementally.

### Wrong service boundaries

Services split by technical layer (frontend service, API service, database service) instead of by business capability (payments, orders, users).

**Fix**: re-split along bounded contexts. Expect months of rework.

---

## The honest migration timeline

For a typical monolith with ~100K lines of code:

```
Month 0:     Decide. (Probably modular monolith first; consider microservices later.)
Months 1-3:  Foundations. Modular boundaries; per-domain data ownership.
Months 3-6:  Extract first service. Strangler fig. Learn the operational model.
Months 6-12: Extract 3-5 more. Standardise patterns: API gateway, observability, mesh.
Months 12+:  Continued evolution. Some areas stay in monolith forever — that's fine.
```

A "fully microservices" outcome at scale is years of work. Most products plateau at 5-15 services per team, modular monolith for the rest.

---

## When you should stop

Sometimes you migrate halfway and realise the monolith was fine.

**Stop signs**:
- The pain you set out to solve hasn't decreased
- Operational complexity is now the main bottleneck
- Cross-service issues consume more time than within-service issues
- Engineers ask "why did we do this?"

It's OK to stop. A modular monolith + 3 extracted services is a valid end-state forever.

---

## What's next

After this path:

- [Scaling Beyond One Region path](scaling-beyond-region.md) — when single region isn't enough
- [Practical Examples](../examples/index.md) — see microservices patterns combined in scenarios
- [Symptom → Concept Lookup](../reference/symptom-lookup.md) — for the architecture-related symptoms

---

## Related

- [Modular Monolith](../architecture/modular-monolith.md) — the destination most teams should aim for
- [Architecture Anti-Patterns](../architecture/anti-patterns.md) — the failure modes
- [Strangler Fig](../architecture/strangler-fig.md) — the migration mechanism
- [Coupling & Cohesion at Service Boundaries](../architecture/coupling-cohesion-services.md) — diagnostic for service health
