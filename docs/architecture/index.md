# Software Architecture

Architectural styles define how you structure a system at the macro level — how components are divided, how they communicate, and how they evolve independently. Choosing the wrong architecture at the start is expensive to undo.

## Foundational patterns

Start here — these are the prerequisites for everything else.

| Topic | What it is | When it matters |
|---|---|---|
| [Layered / N-Tier Architecture](layered-architecture.md) | Presentation → Business → Persistence → DB | Every system has layers. This is the starting point. |
| [Monolith vs Microservices](monolith-vs-microservices.md) | Single deployable unit vs independently deployed services | The most common architectural decision |
| [Domain-Driven Design](ddd.md) | Bounded contexts, aggregates, ubiquitous language | Finding service boundaries; complex domains |
| [Hexagonal Architecture](hexagonal.md) | Ports and adapters — decouple core logic from adapters | Multiple delivery mechanisms; high testability |

## Architectural styles

| Topic | What it is | When it matters |
|---|---|---|
| [Event-Driven Architecture](event-driven.md) | Components communicate through events, not direct calls | Decoupling, async processing, audit trails |
| [Service-Oriented Architecture](soa.md) | SOA vs microservices — what changed and what didn't | Understanding legacy enterprise systems |
| [Serverless Architecture](serverless.md) | Function-level deployment, managed execution, cold starts | Spiky workloads, minimal ops overhead |
| [Twelve-Factor App](twelve-factor.md) | Methodology for production-ready cloud-native apps | Any app going to prod on cloud |

## Migration and client patterns

| Topic | What it is | When it matters |
|---|---|---|
| [Strangler Fig Pattern](strangler-fig.md) | Incrementally replace a monolith without big-bang rewrite | Any monolith-to-microservices migration |
| [Backend for Frontend (BFF)](bff.md) | Dedicated backend per client type (web, mobile, partner) | Different clients need different API shapes |
| [Microservices Patterns](microservices-patterns.md) | Decomposition, database-per-service, ACL, sidecar, anti-patterns | Building and operating a microservices system |
| [Multi-Tenancy](multi-tenancy.md) | Silo / bridge / pool models, tenant isolation, noisy neighbour | Any SaaS product serving multiple customers |

## Platform & data architecture

| Topic | What it is | When it matters |
|---|---|---|
| [API-First Design](api-first.md) | Design the API contract before writing code; code generation from OpenAPI | Parallel teams, microservices, platform APIs |
| [Data Mesh](data-mesh.md) | Federated data ownership — domain teams own their data products | Large org, central data team is a bottleneck |

## Architectural patterns (data & state)

These live in the Patterns section but are architectural decisions, not just implementation details:

| Topic | What it is | When it matters |
|---|---|---|
| [CQRS](../patterns/cqrs.md) | Separate read and write models | Read/write scaling mismatch; multiple read consumers |
| [Event Sourcing](../patterns/event-sourcing.md) | Events are the source of truth; state is derived | Audit trail, temporal queries, complex domain |
| [Saga Pattern](../patterns/saga-pattern.md) | Distributed transactions via compensating actions | Microservices + multi-step transactions |
