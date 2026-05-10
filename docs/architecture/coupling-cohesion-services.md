# Coupling and Cohesion at Service Boundaries

Class-level coupling/cohesion is well-known. At the service boundary, it's a different game: shared databases, synchronous request chains, mutual schema dependencies. This page covers the kinds of coupling that show up between services and how to keep service boundaries clean.

---

## Two ideas

| | Definition |
|---|---|
| **Coupling** | How much one service's changes affect another |
| **Cohesion** | How focused one service is on a single responsibility |

Goal: **low coupling, high cohesion**. Every architectural decision tugs in one direction or the other.

---

## Types of service coupling

### 1. Structural coupling (compile-time)

Service A imports Service B's code or shares a library that defines both.

```python
# Service A imports B's domain types directly
from service_b.domain import Order
```

Symptom: deploying B requires redeploying A.

Fix: define service contracts (Protobuf, JSON Schema, OpenAPI) and consume them; don't share implementation code. Each service has its own type definitions.

### 2. Runtime coupling (sync calls)

A blocks waiting for B:

```
A → B → C → D
```

If any of B/C/D is slow or down, A is slow or down.

Symptom: A's reliability = B's × C's × D's. Cascading failures.

Fix: async where possible; circuit breakers, timeouts, fallbacks; reduce chain depth.

### 3. Temporal coupling

A's behaviour depends on B being available *right now*:

```
Order placed → must charge payment in same request → fail if payment is down
```

Symptom: A's availability depends on B's availability moment-to-moment.

Fix: queue the work, defer to async, accept eventual completion. Order accepted; payment processed asynchronously; failure handled out-of-band.

### 4. Schema coupling (contract)

A reads B's database directly, or relies on B's API shape.

Direct DB access is the worst form — A breaks every time B changes a column.

API coupling is normal but should be **explicit and versioned**. Tolerant readers and additive changes minimise impact.

### 5. Data coupling

A and B share data ownership — both read and write the same records:

```
Both Order service and Inventory service write to the products table.
Schema change to products = both must change.
```

Symptom: data correctness depends on coordination between services.

Fix: clear data ownership. Exactly one service owns each table; others access via API.

### 6. Sequence coupling

A must call B's endpoints in a specific order:

```
1. POST /b/start
2. POST /b/configure
3. POST /b/finalize
4. GET /b/result
```

Symptom: A's logic depends on B's internal workflow.

Fix: B should expose higher-level operations that hide the sequence. "Place an order" not "begin transaction, add items, calculate tax, finalise."

### 7. Pathological coupling

Hidden state coupling — B silently depends on what A did before, in ways not visible in the API.

Example: A and B both write to a shared cache; A's writes implicitly affect B's reads.

Symptom: hard-to-debug bugs that span services.

Fix: explicit ownership of state. If two services touch the same state, that state belongs to one of them or to a third (shared) service with a clear contract.

---

## Spectrum from tightest to loosest

```
Tightest:                                                Loosest:
─────────────────────────────────────────────────────────────────►
Shared DB → Shared lib → Sync RPC → Async events → Eventually consistent
```

Move toward the right when you can; the looser end scales better and absorbs change better.

---

## Cohesion at service boundaries

A service is cohesive when its responsibilities are tightly related and serve a single purpose.

```
Bad cohesion:
  "Utility service" — auth, email, payments, image processing

Good cohesion:
  "Auth service" — login, sessions, MFA, password reset
```

Signs of low cohesion:

- Service does many unrelated things
- Different teams work on different parts of the same service
- Schema has unrelated tables
- "What does X do?" can't be answered in one sentence

Signs of high cohesion:

- Service does one thing well
- One team owns the service
- Schema is focused
- Clear, narrow API

Aligned with **bounded contexts** in DDD.

---

## Bounded contexts as cohesion guides

A bounded context is a region of the domain with a consistent model. Within a context, terms have one meaning; across contexts, they may differ.

```
Order context:
  "Customer" = person who placed an order, identified by ID + shipping address

Marketing context:
  "Customer" = person targeted by campaigns, identified by email + segments

Both are "customer" but the model is different.
```

Each bounded context becomes a service (or a service cluster). Services within a context share models; across contexts, they translate at the boundary.

This is what makes a service cohesive: it serves one bounded context.

See [Domain-Driven Design](ddd.md).

---

## How services should talk

### Synchronous request/response

When the caller needs the answer immediately:

```
Mobile app → API gateway → User service: "What's my profile?"
```

Use sparingly across service boundaries. Each hop adds latency and a failure point.

### Asynchronous events

When the caller doesn't need an immediate answer:

```
Order service → Order Placed event → many subscribers
```

Better for fan-out, secondary actions, eventual consistency.

### Asynchronous commands (queue)

When the caller wants the work done but doesn't need to wait:

```
Order service → "Send notification" → SQS → Notification service
```

Lower coupling than sync; clearer intent than events for "do this work."

### Anti-corruption layer

When integrating with a service whose model doesn't fit yours:

```
External legacy API ──► your-anticorruption-layer ──► your domain
```

Layer translates between models. Their changes don't ripple into your code.

---

## The data ownership question

The single most important coupling question:

```
Who owns the data?

Symptoms of unclear ownership:
  - Two services write to the same table
  - One service reads from another's tables directly
  - Schema changes require multi-team coordination
  - Reports cross multiple services' data via SQL JOIN

Symptoms of clear ownership:
  - Each table has one writing service
  - Other services access via API (or events)
  - Schema changes contained to the owning service
  - Reports use ETL'd / replicated data, not live joins
```

Whenever in doubt: assign ownership; build an API for read access; refactor.

---

## Replication for read-heavy cross-service queries

When service A frequently needs read access to B's data:

```
Option 1 (tight): A queries B via API for every read — B becomes a bottleneck
Option 2 (looser): A keeps a local read replica of B's data via events
Option 3 (loosest): both feed an analytical store; cross-cutting reads happen there
```

Pattern 2 is the **read model** approach. B publishes events; A subscribes and maintains its own queryable view of B's data. A doesn't depend on B's runtime availability for reads.

This is essentially [CQRS](cqrs-event-sourcing-architecture.md) at the service boundary.

---

## Distributed monolith — the failure mode

A "microservices" architecture that has all the costs of microservices and none of the benefits:

- Services tightly coupled via shared DB or sync chains
- Deploys must be coordinated across services
- One change requires changes in multiple services
- Failure cascades across services
- Latency adds up across hops

If your microservices have these properties, you've built a distributed monolith. The fix is *not* "more microservices" — it's reducing coupling.

Often the right move is to **merge services** that are tightly coupled. Coupled-and-distributed is worse than coupled-and-co-located.

---

## Measuring coupling

Hard to measure directly; proxies:

| Proxy | Sign of coupling |
|---|---|
| Cross-service deploy coordination frequency | High = high coupling |
| Cross-service incident frequency | High = high coupling |
| Number of services touched per typical PR | High = high coupling |
| Cross-team review density on a service | High = blurred ownership |
| Lines of "client library" code per service | High = structural coupling |
| Synchronous chain depth | Deep = high runtime coupling |

Track these over time. Worsening trends signal architectural drift.

---

## Refactoring toward looser coupling

Common moves:

```
1. Replace shared DB with API ownership
   "Service A queries Service B's table" → "A calls B's API"
   
2. Replace sync chain with async events
   "A → B → C" → "A publishes event; B and C subscribe"
   
3. Introduce read replicas
   "A frequently queries B" → "A maintains local view from B's events"
   
4. Add anti-corruption layer
   "A handles B's model directly" → "A wraps B in a clean abstraction"
   
5. Merge tightly coupled services
   "A and B always change together" → "merge them into one service"
```

Each move is incremental. Use [strangler fig](strangler-fig.md) to migrate without big-bang changes.

---

## When tight coupling is acceptable

Not all coupling is bad. Some is appropriate:

- Within a bounded context (services in the same context naturally share more)
- Between a service and its directly-paired client SDK
- Library-level coupling for shared infrastructure (logging, observability)
- Tightly-coupled-by-design subsystems (e.g., search index + search query service)

The rule: be deliberate. Coupled-on-purpose is fine; coupled-by-accident is debt.

---

## Common smells and refactors

| Smell | Refactor |
|---|---|
| Service A imports Service B's classes | Define contract; A and B independently implement |
| Service A reads Service B's tables | A calls B's API or subscribes to B's events |
| Two services write to one table | Pick an owner; other service calls API |
| 10-deep sync chain | Introduce async; reduce critical path depth |
| "ChangeRequest" in service A requires changes to B and C | Re-examine boundaries; possibly merge |
| Shared "common" library that grows unbounded | Split into domain-specific libraries; resist additions |

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you can diagnose architectural coupling — not just talk about microservices in the abstract.

**Strong answer pattern:**
1. Coupling types: structural, runtime, temporal, schema, data, sequence, pathological
2. Each service should own its data; reads via API or local replica
3. Bounded contexts guide cohesion; services within a context naturally cluster
4. Async events lower coupling more than sync calls
5. Tight coupling at service boundary = "distributed monolith" — worst of both worlds
6. Sometimes the right move is to merge services, not split

**Common follow-up:** *"You inherited a 30-service architecture with all 30 services in one deploy. What do you do?"*
> First, diagnose: is it a distributed monolith or a coordination problem? Map dependencies — sync chains, shared databases, deploy coupling. Identify the most coupled groups; consider merging them. For the genuinely-independent services, fix the deploy pipeline so they can deploy independently. Rule of thumb: 30 services that can't deploy independently is worse than 5 services that can. Don't preserve the count; preserve the property "deployable independently."

---

## Related topics

- [Microservices Patterns](microservices-patterns.md) — concrete coupling-reduction patterns
- [Bounded contexts in DDD](ddd.md) — guiding cohesion
- [Modular Monolith](modular-monolith.md) — same coupling principles in-process
- [Event-Driven Architecture](event-driven.md) — async events lower coupling
- [API Versioning](../api/versioning.md) — schema coupling management
