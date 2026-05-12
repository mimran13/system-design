# Reading Path: Building a SaaS

18 pages for someone shipping a B2B SaaS product end-to-end. Covers stack choice, multi-tenancy, payments, scaling, ops, and the transitions you'll hit as you grow.

Aimed at: founders, tech leads, senior engineers planning a new product or hardening an existing one. Assumes basic backend knowledge — do the [Essentials path](essentials.md) first if needed.

---

## Why these 18

A SaaS product hits the same architectural questions at the same growth stages. This path follows that timeline: start with the right defaults, layer in capability as you grow.

Estimated time: **~5 hours of reading**.

---

## Stage 1: Picking the stack (~$0 to $100K ARR)

Don't over-engineer day-1. Boring tech wins.

| # | Page | Why for SaaS |
|---|---|---|
| 1 | [Twelve-Factor App](../architecture/twelve-factor.md) | The cloud-native baseline. Get this right or pay forever. |
| 2 | [Modular Monolith](../architecture/modular-monolith.md) | The right starting architecture for 99% of SaaS at this stage |
| 3 | [SQL vs NoSQL](../storage/sql-vs-nosql.md) | Postgres should be the default. Know when not to. |
| 4 | [Hexagonal Architecture](../architecture/hexagonal.md) | Keeps domain code clean as the modular monolith grows |

## Stage 2: Multi-tenancy (~$100K to $1M ARR)

You're now serving multiple customers. The tenancy model you pick shapes everything.

| # | Page | Why for SaaS |
|---|---|---|
| 5 | [Multi-Tenancy](../architecture/multi-tenancy.md) | Pooled vs siloed vs bridge — pick the model |
| 6 | [Multi-Tenant SaaS Examples](../examples/multi-tenant-saas.md) | 4 concrete scenarios: tenant isolation, noisy neighbour, per-region, onboarding |
| 7 | [Bulkhead](../patterns/bulkhead.md) | Per-tenant resource isolation when a noisy customer appears |
| 8 | [Rate Limiting](../patterns/rate-limiting.md) | Per-tenant request rate limits by tier |

## Stage 3: Correctness on every operation (any stage)

Things that should be right from day-1.

| # | Page | Why for SaaS |
|---|---|---|
| 9 | [Idempotency](../patterns/idempotency.md) | Webhook retries, payment retries — must not double-process |
| 10 | [Payments & Correctness Examples](../examples/payments-and-correctness.md) | 4 scenarios: idempotent payment, multi-step checkout, refunds, fraud |
| 11 | [Outbox Pattern](../patterns/outbox.md) | Dual-write reliability: DB + event publish atomic |

## Stage 4: Scaling reads and operations (~$1M to $10M ARR)

The first scale headaches usually hit here.

| # | Page | Why for SaaS |
|---|---|---|
| 12 | [Caching Strategies](../caching/caching-strategies.md) | The fastest scaling win |
| 13 | [Read Replicas](../patterns/read-replicas.md) | Read scaling without changing the data model |
| 14 | [Scaling & Performance Examples](../examples/scaling-and-performance.md) | 4 scenarios: hot keys, write-heavy workloads, social timeline, search at scale |

## Stage 5: Reliability and ops (continuous from day-1)

The "shipped without breaking" infrastructure.

| # | Page | Why for SaaS |
|---|---|---|
| 15 | [CI/CD Fundamentals](../cicd/fundamentals.md) | Pipeline-as-code, branch protection, OIDC auth |
| 16 | [Deployment Strategies](../cicd/deployment-strategies.md) | Canary, blue/green, feature flags — minimum risk releases |
| 17 | [Observability index](../observability/index.md) | Logs, metrics, traces — the three pillars |
| 18 | [SLI, SLO & SLA](../observability/slo-sla.md) | Define what "up" means; track error budgets |

---

## The mental model — stages and triggers

```
Stage 1: One process, one database
  Trigger to move on: feature teams forming, modules tangling

Stage 2: Modular monolith with strict boundaries
  Trigger to move on: ~50 engineers; one module needs different scaling

Stage 3: Some services split out from monolith
  Trigger to move on: cross-region demand; major scale jump

Stage 4: Microservices or modular monolith + key services
  Trigger to move on: global users, data residency, regulatory
```

Many successful SaaS products stay at stage 2 forever. There's no rule that says you must reach stage 4.

---

## Cost shape across stages

Rough monthly infrastructure cost (AWS, 2026 prices):

| Stage | Bill | Why |
|---|---|---|
| Stage 1 (~$0 to $100K ARR) | $200-1K | Single RDS + one EC2/ECS + S3 + Cloudfront |
| Stage 2 ($100K to $1M ARR) | $1-5K | + read replica, Redis cache, multi-AZ, more compute |
| Stage 3 ($1M to $10M ARR) | $5-30K | + multiple services, ES for search, Kafka, observability stack |
| Stage 4 ($10M+ ARR) | $30K-1M+ | Multi-region, dedicated tenant infra for top customers |

Spend disproportionately on what's actually expensive: compute, database, egress. CDN and managed services are usually fine.

---

## Architectural defaults for SaaS

```
✓ Postgres unless you have a real reason not to
✓ Redis for caching, queues, rate limiting, locks
✓ Sidekiq/Celery/RQ for background jobs (don't reinvent)
✓ Stripe for payments (don't roll your own)
✓ Auth0 / Cognito / Clerk for auth (don't roll your own)
✓ Sentry / Datadog for observability
✓ Cloudflare or CloudFront for CDN
✓ S3 for files, with presigned URLs for direct upload
✓ Twelve-factor: config in env vars; stateless app; logs to stdout
✓ Modular monolith with bounded contexts per business domain

Common premature optimisations to avoid:
✗ Kubernetes for a 5-person team (use ECS Fargate / managed)
✗ Microservices day-1 (modular monolith first)
✗ Kafka when you have 100 events/sec (SQS / Redis is fine)
✗ Multi-region until customers demand it
✗ DynamoDB / NoSQL "for scale" (Postgres scales further than you think)
✗ Service mesh for 3 services
```

---

## When you're getting it wrong — warning signs

| Symptom | Likely problem | Fix |
|---|---|---|
| Tenants seeing each other's data (one off, but real) | Missing tenant_id filter; weak data isolation | Postgres Row Level Security |
| One customer slows everyone | Noisy neighbour | Bulkhead, rate limit per tenant |
| Database CPU pegged at 60% sustained | No caching | Add Redis cache layer |
| Deploys are scary, 30 min long | Big-bang deploys, no feature flags | CI/CD investment |
| Engineering velocity slowing as team grows | Module boundaries blurred | Modular monolith hygiene; eventually split |
| Cost growing faster than revenue | No cost monitoring per resource | Tags + AWS Cost Explorer |
| First request slow, rest fast | No connection pooling | PgBouncer / connection pool |

---

## What's next

After this path:

- [Symptom → Concept Lookup](../reference/symptom-lookup.md) — bookmark; consult when something feels off
- [Decision Flowcharts](../reference/decision-flowcharts.md) — when picking between options
- [Monolith → Microservices path](monolith-to-microservices.md) — when you outgrow stage 2-3
- [Scaling Beyond One Region path](scaling-beyond-region.md) — when you need global

---

## Related

- [Practical Examples](../examples/index.md) — see SaaS concepts combined in scenarios
- [Architecture Anti-Patterns](../architecture/anti-patterns.md) — recognise mistakes early
- [Capacity Planning](../architecture/capacity-planning.md) — sizing for projected demand
