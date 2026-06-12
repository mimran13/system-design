# Software Architecture

How you organise services, data, and teams determines every later decision — performance, scalability, maintainability, ops cost. This section covers architectural decision-making, the dominant styles, cross-cutting concerns, and the anti-patterns to avoid.

Grouped into five themes: read top-to-bottom for the full curriculum, or jump to the theme matching your current question.

## Suggested reading order

New to this topic? Read these in order — each builds on the previous:

1. [Quality Attributes](quality-attributes.md) — the vocabulary of trade-offs every later decision is judged by
2. [Architectural Decision Records (ADRs)](adrs.md) — how to capture decisions before you start making them
3. [Layered / N-Tier](layered-architecture.md) — the simplest baseline style most systems start from
4. [Monolith vs Microservices](monolith-vs-microservices.md) — the central decomposition decision
5. [Modular Monolith](modular-monolith.md) — the pragmatic middle ground most teams should try first
6. [Domain-Driven Design](ddd.md) — bounded contexts: how to find good service boundaries
7. [Event-Driven Architecture](event-driven.md) — async decoupling, the other dominant modern style
8. [Architecture Anti-Patterns](anti-patterns.md) — recognise the failure modes before you build one

**Then, as needed (reference):** [Architecture Styles Comparison](styles-comparison.md), [Twelve-Factor App](twelve-factor.md), [Hexagonal Architecture](hexagonal.md), [Microservices Patterns](microservices-patterns.md), [Choreography vs Orchestration](choreography-vs-orchestration.md), [Multi-Tenancy](multi-tenancy.md), [Capacity Planning & Sizing](capacity-planning.md)

**Advanced — come back later:** [CQRS & Event Sourcing as Architecture](cqrs-event-sourcing-architecture.md), [Multi-Region Architecture](multi-region.md), [Edge Architecture](edge-architecture.md), [Data Mesh](data-mesh.md), [Lambda & Kappa Architectures](lambda-kappa-architectures.md), [Space-Based Architecture](space-based.md), [Evolutionary Architecture](evolutionary-architecture.md), [Strangler Fig Pattern](strangler-fig.md)

---

## Decision-Making

How architects actually choose, document, and evolve architecture.

| Topic | What it covers |
|---|---|
| [Architectural Decision Records (ADRs)](adrs.md) | Capturing decisions so they survive turnover |
| [Fitness Functions](fitness-functions.md) | Automated checks that prevent architectural drift |
| [Evolutionary Architecture](evolutionary-architecture.md) | Building for change, not against it |
| [Quality Attributes](quality-attributes.md) | The "ilities" — performance, security, ops, cost |
| [Capacity Planning & Sizing](capacity-planning.md) | Sizing infrastructure to projected demand |

---

## Architectural Styles

The major shapes of systems. Most real systems blend several.

| Topic | What it covers |
|---|---|
| [Layered / N-Tier](layered-architecture.md) | Traditional CRUD layered approach |
| [Monolith vs Microservices](monolith-vs-microservices.md) | The classic decomposition decision |
| [Modular Monolith](modular-monolith.md) | The "missing middle" — modular, single-deployable |
| [Service-Oriented (SOA)](soa.md) | Pre-microservices distributed systems |
| [Hexagonal Architecture](hexagonal.md) | Ports and adapters; isolating the domain |
| [Domain-Driven Design](ddd.md) | Bounded contexts, ubiquitous language |
| [Event-Driven Architecture](event-driven.md) | Async events, decoupled producers/consumers |
| [Serverless Architecture](serverless.md) | Functions-as-a-service, managed runtimes |
| [Pipes and Filters](pipes-and-filters.md) | Stream processing, ETL, build pipelines |
| [Space-Based Architecture](space-based.md) | In-memory grids for ultra-high throughput |
| [CQRS & Event Sourcing as Architecture](cqrs-event-sourcing-architecture.md) | When CQRS+ES becomes the system style |
| [Architecture Styles Comparison](styles-comparison.md) | Side-by-side trade-offs |

---

## Cross-Cutting Concerns

Patterns that show up regardless of style.

| Topic | What it covers |
|---|---|
| [Twelve-Factor App](twelve-factor.md) | The cloud-native baseline |
| [Backend for Frontend (BFF)](bff.md) | Tailored APIs per client type |
| [API-First Design](api-first.md) | Define the contract before implementing |
| [API Versioning at Architecture Level](api-versioning-architecture.md) | Strategies for evolving public contracts |
| [Microservices Patterns](microservices-patterns.md) | Service mesh, sidecars, service discovery |
| [Choreography vs Orchestration](choreography-vs-orchestration.md) | Event-based vs coordinator-driven workflows |
| [Coupling & Cohesion at Service Boundaries](coupling-cohesion-services.md) | What to manage at the inter-service layer |
| [Multi-Tenancy](multi-tenancy.md) | Pooled, siloed, hybrid SaaS approaches |

---

## Distribution & Scale

When the system goes global, multi-cloud, or big-data.

| Topic | What it covers |
|---|---|
| [Multi-Region Architecture](multi-region.md) | Active-active, active-passive, read replicas |
| [Edge Architecture](edge-architecture.md) | Compute at CDN PoPs |
| [Lambda & Kappa Architectures](lambda-kappa-architectures.md) | Big-data batch + stream patterns |
| [Data Mesh](data-mesh.md) | Domain-oriented decentralised data ownership |

---

## Evolution & Pitfalls

How to evolve architecture safely, and what to recognise when things have gone wrong.

| Topic | What it covers |
|---|---|
| [Strangler Fig Pattern](strangler-fig.md) | Migrating without rewrites |
| [Architecture Anti-Patterns](anti-patterns.md) | Distributed monolith, big ball of mud, cargo cult, others |

---

## Reading paths

| If you have... | Read first |
|---|---|
| 30 minutes | ADRs, Quality Attributes, Modular Monolith, Anti-Patterns |
| 2 hours | + Hexagonal, DDD, Microservices Patterns, Choreography vs Orchestration |
| A weekend | + everything in Decision-Making + Architectural Styles + Multi-Region |

---

## Interview shortlist

| Question | Section |
|---|---|
| *"How would you decide between monolith and microservices?"* | Modular Monolith, Monolith vs Microservices |
| *"How do you record architectural decisions?"* | ADRs |
| *"What quality attributes drove the design?"* | Quality Attributes |
| *"Choreography vs orchestration — which when?"* | Choreography vs Orchestration |
| *"Distributed monolith — what is it and how do you avoid it?"* | Anti-Patterns, Coupling & Cohesion |
| *"How do you size a system?"* | Capacity Planning |
| *"What's CQRS + Event Sourcing actually for?"* | CQRS & ES as Architecture |
| *"How do you evolve architecture without rewrites?"* | Strangler Fig, Evolutionary Architecture |

---

## Related sections

- [Software Design](../software-design/index.md) — code-level structure that supports good architecture
- [Distributed Systems](../distributed/index.md) — the theoretical foundation
- [Patterns](../patterns/index.md) — implementation-level patterns
- [Microservices ↔ CI/CD](../cicd/index.md) — how architecture meets delivery
