# Software Architecture

<div class="sec-hero" markdown>
<span class="ey">Architecture · designing systems</span>
How you organise services, data, and teams determines every later decision — performance, scalability, maintainability, ops cost. This section covers architectural decision-making, the dominant styles, cross-cutting concerns, and the anti-patterns to avoid.
</div>

## Roadmap

<div class="roadmap">
  <div class="rm-head">
    <span class="h">🧭 Architecture roadmap</span>
    <span class="legend">
      <i><span class="sw core"></span>core path</i>
      <i><span class="sw opt"></span>read as needed</i>
      <i><span class="sw adv"></span>advanced / later</i>
    </span>
  </div>
  <p class="rm-sub">Follow the spine top-to-bottom your first time. Branches hang off the topic they support — grab them when you need them.</p>
  <div class="rm-track">
    <div class="rm-stop">
      <a class="rm-node" href="quality-attributes/"><span class="n">1</span>Quality Attributes</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="adrs/"><span class="n">2</span>ADRs</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="layered-architecture/"><span class="n">3</span>Layered / N-Tier</a>
      <div class="rm-branch right"><a class="rm-chip" href="hexagonal/">Hexagonal Architecture</a></div>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="monolith-vs-microservices/"><span class="n">4</span>Monolith vs Microservices</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="modular-monolith/"><span class="n">5</span>Modular Monolith</a>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="microservices-patterns/">Microservices Patterns</a></div>
      <a class="rm-node" href="ddd/"><span class="n">6</span>Domain-Driven Design</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="event-driven/"><span class="n">7</span>Event-Driven Architecture</a>
      <div class="rm-branch right"><a class="rm-chip" href="multi-region/">Multi-Region Architecture</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="strangler-fig/">Strangler Fig Pattern</a></div>
      <a class="rm-node" href="anti-patterns/"><span class="n">8</span>Architecture Anti-Patterns</a>
    </div>
  </div>
</div>

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

## Decision-Making

How architects actually choose, document, and evolve architecture.

<div class="pcards">
<a class="pcard" href="adrs/"><span class="t">Architectural Decision Records (ADRs)</span><span class="d">Capturing decisions so they survive turnover</span></a>
<a class="pcard" href="fitness-functions/"><span class="t">Fitness Functions</span><span class="d">Automated checks that prevent architectural drift</span></a>
<a class="pcard" href="evolutionary-architecture/"><span class="t">Evolutionary Architecture</span><span class="d">Building for change, not against it</span></a>
<a class="pcard" href="quality-attributes/"><span class="t">Quality Attributes</span><span class="d">The "ilities" — performance, security, ops, cost</span></a>
<a class="pcard" href="capacity-planning/"><span class="t">Capacity Planning & Sizing</span><span class="d">Sizing infrastructure to projected demand</span></a>
</div>

## Architectural Styles

The major shapes of systems. Most real systems blend several.

<div class="pcards">
<a class="pcard" href="layered-architecture/"><span class="t">Layered / N-Tier</span><span class="d">Traditional CRUD layered approach</span></a>
<a class="pcard" href="monolith-vs-microservices/"><span class="t">Monolith vs Microservices</span><span class="d">The classic decomposition decision</span></a>
<a class="pcard" href="modular-monolith/"><span class="t">Modular Monolith</span><span class="d">The "missing middle" — modular, single-deployable</span></a>
<a class="pcard" href="soa/"><span class="t">Service-Oriented (SOA)</span><span class="d">Pre-microservices distributed systems</span></a>
<a class="pcard" href="hexagonal/"><span class="t">Hexagonal Architecture</span><span class="d">Ports and adapters; isolating the domain</span></a>
<a class="pcard" href="ddd/"><span class="t">Domain-Driven Design</span><span class="d">Bounded contexts, ubiquitous language</span></a>
<a class="pcard" href="event-driven/"><span class="t">Event-Driven Architecture</span><span class="d">Async events, decoupled producers/consumers</span></a>
<a class="pcard" href="serverless/"><span class="t">Serverless Architecture</span><span class="d">Functions-as-a-service, managed runtimes</span></a>
<a class="pcard" href="pipes-and-filters/"><span class="t">Pipes and Filters</span><span class="d">Stream processing, ETL, build pipelines</span></a>
<a class="pcard" href="space-based/"><span class="t">Space-Based Architecture</span><span class="d">In-memory grids for ultra-high throughput</span></a>
<a class="pcard" href="cqrs-event-sourcing-architecture/"><span class="t">CQRS & Event Sourcing as Architecture</span><span class="d">When CQRS+ES becomes the system style</span></a>
<a class="pcard" href="styles-comparison/"><span class="t">Architecture Styles Comparison</span><span class="d">Side-by-side trade-offs</span></a>
</div>

## Cross-Cutting Concerns

Patterns that show up regardless of style.

<div class="pcards">
<a class="pcard" href="twelve-factor/"><span class="t">Twelve-Factor App</span><span class="d">The cloud-native baseline</span></a>
<a class="pcard" href="bff/"><span class="t">Backend for Frontend (BFF)</span><span class="d">Tailored APIs per client type</span></a>
<a class="pcard" href="api-first/"><span class="t">API-First Design</span><span class="d">Define the contract before implementing</span></a>
<a class="pcard" href="api-versioning-architecture/"><span class="t">API Versioning at Architecture Level</span><span class="d">Strategies for evolving public contracts</span></a>
<a class="pcard" href="microservices-patterns/"><span class="t">Microservices Patterns</span><span class="d">Service mesh, sidecars, service discovery</span></a>
<a class="pcard" href="choreography-vs-orchestration/"><span class="t">Choreography vs Orchestration</span><span class="d">Event-based vs coordinator-driven workflows</span></a>
<a class="pcard" href="coupling-cohesion-services/"><span class="t">Coupling & Cohesion at Service Boundaries</span><span class="d">What to manage at the inter-service layer</span></a>
<a class="pcard" href="multi-tenancy/"><span class="t">Multi-Tenancy</span><span class="d">Pooled, siloed, hybrid SaaS approaches</span></a>
</div>

## Distribution & Scale

When the system goes global, multi-cloud, or big-data.

<div class="pcards">
<a class="pcard" href="multi-region/"><span class="t">Multi-Region Architecture</span><span class="d">Active-active, active-passive, read replicas</span></a>
<a class="pcard" href="edge-architecture/"><span class="t">Edge Architecture</span><span class="d">Compute at CDN PoPs</span></a>
<a class="pcard" href="lambda-kappa-architectures/"><span class="t">Lambda & Kappa Architectures</span><span class="d">Big-data batch + stream patterns</span></a>
<a class="pcard" href="data-mesh/"><span class="t">Data Mesh</span><span class="d">Domain-oriented decentralised data ownership</span></a>
</div>

## Evolution & Pitfalls

How to evolve architecture safely, and what to recognise when things have gone wrong.

<div class="pcards">
<a class="pcard" href="strangler-fig/"><span class="t">Strangler Fig Pattern</span><span class="d">Migrating without rewrites</span></a>
<a class="pcard" href="anti-patterns/"><span class="t">Architecture Anti-Patterns</span><span class="d">Distributed monolith, big ball of mud, cargo cult, others</span></a>
</div>

## Reading paths

| If you have... | Read first |
|---|---|
| 30 minutes | ADRs, Quality Attributes, Modular Monolith, Anti-Patterns |
| 2 hours | + Hexagonal, DDD, Microservices Patterns, Choreography vs Orchestration |
| A weekend | + everything in Decision-Making + Architectural Styles + Multi-Region |

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

## Related sections

- [Software Design](../software-design/index.md) — code-level structure that supports good architecture
- [Distributed Systems](../distributed/index.md) — the theoretical foundation
- [Patterns](../patterns/index.md) — implementation-level patterns
- [Microservices ↔ CI/CD](../cicd/index.md) — how architecture meets delivery
