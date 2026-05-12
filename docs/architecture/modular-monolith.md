---
tags:
  - interview-critical
  - boring-tech
  - for-saas
---

# Modular Monolith

The "third option" between a tangled monolith and full microservices. A modular monolith is **deployed as one unit** but **internally structured as independent modules** with clear boundaries, separate data ownership, and explicit interfaces. It captures most of microservices' organisational benefits without the operational overhead.

---

## You'll see this when...

- Small-to-mid team (5-50 engineers) wants clean boundaries without microservices ops
- Team built microservices, hit operational pain, wants to consolidate
- Spring Modulith, NestJS modules, Django apps with strict boundary enforcement
- Per-module schema (`orders.*`, `payments.*`) in a shared database
- Codebase has `modules/`, `domains/`, or `bounded-contexts/` folders with import rules
- Architects say "we need bounded contexts but don't want to deploy 30 services"
- Migrating a tangled monolith → "let's modularise first, then consider splitting"

---

## Cost reality

A modular monolith is typically **5-10× cheaper** than microservices at small-to-mid scale (AWS, 2026):

```
Single-team SaaS, $0-100K ARR:
  Compute:           1 service in ECS Fargate or App Runner → $50-300/month
  Database:          One Postgres + read replica → $200-500
  Cache:             ElastiCache small → $100
  Observability:     Sentry + a metrics service → $50-200
  Total infra:       $400-1,100/month
  Ops effort:        few hours/week

Mid-stage SaaS, $1-10M ARR:
  Compute:           2-3 monolith instances, multi-AZ → $500-2K/month
  Database:          Aurora + replicas → $500-2K
  Cache:             ElastiCache cluster → $300-1K
  Observability:     Datadog → $500-2K
  Total infra:       $2K-7K/month
  Ops effort:        ~0.5 FTE
```

Same workload as microservices: typically 2-5× more expensive once you add service mesh, multiple databases, API gateway, distributed tracing, and platform team.

The modular monolith carries you a long way. Don't rush past it for non-cost reasons.

---

## What it is

```
Tangled monolith:
  Everything imports everything; no boundaries
  One database, all tables shared
  One deploy, one team, one process

Modular monolith:
  ┌────────────────────────────────────────┐
  │ Single deployable                      │
  │  ┌────────┐ ┌────────┐ ┌────────────┐ │
  │  │ Orders │ │Payments│ │ Inventory  │ │
  │  ├────────┤ ├────────┤ ├────────────┤ │
  │  │ DB     │ │ DB     │ │ DB         │ │
  │  └────────┘ └────────┘ └────────────┘ │
  │  inter-module calls via interfaces only │
  └────────────────────────────────────────┘
  
  One process, but modules talk via APIs (in-process) and have separate data.

Microservices:
  Many deployables, network calls, distributed everything
```

---

## Why it's the right answer for many teams

The microservices vs monolith debate often misses that **most architectural problems are about modularity, not deployment topology**. A well-modularised single deployable solves:

- Team autonomy (each team owns modules)
- Code organisation (clear boundaries)
- Independent reasoning (read one module without the others)

Without paying for:

- Network latency between every call
- Distributed transactions
- Service discovery, mesh, multi-cluster ops
- Database per service operational burden
- Tracing across N services

The bar for microservices is high. Modular monolith clears most of the same goals at a fraction of the cost.

---

## When modular monolith fits

```
✓ Small to medium team (5-50 engineers)
✓ Single product or tightly-related products
✓ Changes typically span concerns
✓ Want fast iteration without distributed-systems tax
✓ Need clear ownership without operational overhead
```

When it stops fitting:

```
✗ Large org (100s of engineers) needing independent deploy cadence
✗ Modules with very different scaling profiles (one needs 1000× more compute)
✗ Multi-language stack mandated
✗ Strict regulatory boundaries between modules (must be physically separate)
```

In those cases, evolve the modular monolith → microservices via [strangler fig](strangler-fig.md). That's much easier than starting with microservices.

---

## Module structure

```
src/
├── orders/                       # module 1
│   ├── domain/                   # business logic
│   ├── application/              # use cases / commands
│   ├── infrastructure/           # DB adapters
│   ├── api/                      # public interface for other modules
│   └── orders.module.ts          # explicit module entry point
├── payments/                     # module 2
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   ├── api/
│   └── payments.module.ts
├── inventory/                    # module 3
│   ├── ...
└── shared/                       # cross-cutting (logging, errors, util)
```

Three rules:

1. **Modules expose a public API**; other modules call only through it
2. **Modules own their data**; no other module reads their tables directly
3. **Cross-module communication is through interfaces**, not internal classes

Tools that enforce this:

- ArchUnit (Java)
- `dependency-cruiser` (JS/TS)
- `pylint --import` constraints (Python)
- Module visibility (Java, Kotlin, Go internal packages)

---

## Data ownership per module

Each module owns its tables. Other modules don't read them directly.

```
Orders module → owns orders, order_items tables
Payments module → owns payments, payment_methods tables
Inventory module → owns products, stock_levels tables
```

When the Orders module needs payment info, it calls `payments.get_payment(order_id)` — not a SQL JOIN.

This rule prevents the most insidious form of coupling: shared tables. With shared tables:

- Schema changes break unrelated modules
- Performance issues in one module's queries hit everyone
- "Quick fix" reads from another module's tables proliferate

A modular monolith keeps tables module-private even though they live in the same database.

### Schema-per-module approaches

Several ways to enforce data ownership in one DB:

```sql
-- Approach 1: schema per module
CREATE SCHEMA orders;
CREATE SCHEMA payments;

-- Module's user only has access to its own schema
CREATE USER orders_user;
GRANT ALL ON SCHEMA orders TO orders_user;

-- Approach 2: prefixed table names + linter rule
orders_table, payments_table, inventory_table

-- Approach 3: separate physical databases (already moving toward microservices)
```

Schema-per-module is the cleanest in-process choice.

---

## In-process module communication

Modules call each other through their public APIs:

```typescript
// orders/api/index.ts
export interface OrdersApi {
  createOrder(req: CreateOrderRequest): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
}

// orders/orders.module.ts
export class OrdersModule implements OrdersApi {
  constructor(
    private payments: PaymentsApi,    // injected, not imported directly
    private inventory: InventoryApi,
  ) {}
  
  async createOrder(req: CreateOrderRequest): Promise<Order> {
    await this.inventory.reserve(req.productId, req.quantity);
    const payment = await this.payments.charge(req.userId, req.totalCents);
    // ...
  }
}
```

Properties:

- **No serialisation cost** — direct function calls
- **No network latency** — same process
- **Strong typing** — TypeScript / Java / Rust enforces interface contracts
- **Testable** — mock the dependency interface
- **Refactorable** — IDE rename across module boundaries works

If you later split the module into a service, the interface stays the same; only the implementation changes from in-process call to RPC.

---

## Inter-module events

For loose coupling, modules can publish events instead of calling each other directly:

```typescript
// orders/orders.module.ts
async createOrder(req) {
  const order = await this.repo.save(...);
  this.events.publish(new OrderCreatedEvent(order));   // fire and forget
  return order;
}

// payments/payments.module.ts (subscribes)
this.events.subscribe(OrderCreatedEvent, async (event) => {
  await this.startPaymentProcess(event.order);
});
```

Same pattern as event-driven microservices, but:

- In-process bus, not Kafka
- Synchronous or async, your choice
- Easy to make async-disk-backed when modules split out

---

## Testing modular monoliths

Three levels:

```
1. Unit tests:        within a module, mocked dependencies
2. Module tests:      whole module, its DB, mocked external services
3. Integration tests: multiple modules together, real DB, real events
```

The modular structure makes module-level tests possible — boot one module + its DB, test it in isolation. With a tangled monolith, every test starts the whole app.

---

## Deployment

One unit. Build, test, deploy as a whole.

```yaml
# Deployment is simple
- name: Build
  run: npm run build

- name: Deploy
  run: kubectl set image deployment/myapp app=$IMAGE_TAG
```

Compared to N services × N pipelines × N service meshes × N… you get the idea.

The modular monolith trades "module independence at deploy time" for everything else.

---

## Migration: modular monolith → microservices

When the team grows past where the monolith fits, splitting modules into services is mechanical:

```
1. Pick the module with the highest "rate of change × team count" pressure
2. Replace its in-process API with an HTTP/gRPC adapter
3. Move the module to its own deployment unit
4. Database stays in the monolith initially; migrate later
5. Other modules now call the new service instead of in-process
```

If the modular structure was real, this works. If modules were tangled despite the folder structure, it's painful — same as splitting any tangled system.

The principle: **earn microservices**. Start with a modular monolith; split only the parts that need to be split, when they need to be split.

---

## Common mistakes

**1. Modules in name only.**

```
src/
├── orders/
├── payments/
├── inventory/
```

But everything imports everything. Folder names don't enforce boundaries; tooling does.

**2. Shared "common" module.**

A `common/` module that grows unbounded becomes the new monolith. Keep it minimal — only truly cross-cutting concerns (logging, error types, value objects).

**3. Skipping data ownership.**

Modules that share tables are not modules. They're folders. Enforce per-module data ownership from day one.

**4. Cross-module calls bypassing the API.**

```typescript
// BAD: direct import of internal class
import { OrderRepository } from '../orders/infrastructure/order-repository';

// GOOD: only through the module API
import { OrdersApi } from '../orders/api';
```

Use linter rules / module visibility to enforce.

**5. Over-engineering.**

Don't model 50 modules in a 5-module problem. Start with bounded contexts that match team ownership; split further only when justified.

---

## Frameworks that support modular monoliths

| Framework | Notes |
|---|---|
| NestJS (Node.js) | Module concept built-in |
| Spring Modulith (Java) | Documents and verifies module boundaries |
| Django apps (Python) | Loose convention; needs discipline |
| Phoenix contexts (Elixir) | Strong convention |
| Rails engines (Ruby) | Heavyweight; mostly used for plugins |
| Clean Architecture (any lang) | Conceptual; you still need the discipline |

Spring Modulith is particularly interesting — it provides explicit module boundary verification, integration testing per module, and event-based inter-module communication.

---

## Tradeoffs vs microservices

| | Modular monolith | Microservices |
|---|---|---|
| Operational complexity | Low | High |
| Independent deploys | No | Yes |
| Independent scaling | Limited (whole app) | Per service |
| Inter-module calls | µs (function call) | ms (network) |
| Distributed transactions | Trivial (one DB) | Hard |
| Team autonomy | Logical | Logical + operational |
| Polyglot stack | No | Yes |
| Failure isolation | Crash = everyone down | Per service |
| Testing | Easier (one process) | Harder (multiple services) |
| Migration cost to microservices | Low (already modular) | N/A |

Modular monolith wins on most dimensions for small-to-mid teams. Microservices wins where independent deploy / scale / operational isolation is critical.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you've outgrown the "microservices everywhere" reflex.

**Strong answer pattern:**
1. Modular monolith: one deployable, internally modular with separate data ownership
2. Captures most microservices benefits (boundaries, ownership, testability) at fraction of the cost
3. Right default for small-to-mid teams
4. Earn microservices: split modules when scale or org structure justifies
5. Module structure is enforced by tooling, not folders

**Common follow-up:** *"When would you NOT recommend a modular monolith?"*
> When modules genuinely need different scaling characteristics (one needs 1000 instances, another needs 5), when the team is large enough that single-deployable coordination becomes a bottleneck (~50+ engineers in one codebase), or when regulatory / security boundaries require physical separation (PCI scope reduction). For most teams, modular monolith is the right starting point and possibly the permanent answer.

---

## Related topics

- [Monolith vs Microservices](monolith-vs-microservices.md) — the broader debate
- [Domain-Driven Design](ddd.md) — bounded contexts map to modules
- [Hexagonal Architecture](hexagonal.md) — internal module structure
- [Strangler Fig](strangler-fig.md) — migration path when needed
- [Coupling & Cohesion at Service Boundaries](coupling-cohesion-services.md) — applies in-process too
