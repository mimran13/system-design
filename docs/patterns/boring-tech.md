---
tags:
  - boring-tech
  - applied
  - for-saas
---

# Boring Technology

The case for picking simple, well-understood tools over novel, complex ones. Most engineering organisations under-invest here. This page is the explicit argument plus the signals for when to graduate.

Coined in Dan McKinley's essay "Choose Boring Technology" — the principle that **innovation budget is finite**, and most teams should spend it on their product, not their infrastructure.

---

## What "boring" means

Boring technology is:

- **Well-understood** — proven, decades of production use, large community
- **Predictable** — known failure modes, established operational playbooks
- **Hire-able** — easy to find engineers who know it
- **Compatible** — works with existing tools and ecosystems
- **Modest** — not the trending pick at conferences

Boring is **not**:

- Old
- Bad
- Lazy
- Behind the curve

Postgres, Redis, Sidekiq/Celery, Cron, Nginx, Docker, Linux — these are boring. They're also the substrate of most successful products.

---

## The boring SaaS stack

For most products under 50 engineers, this stack handles 80% of needs:

| Layer | Boring choice |
|---|---|
| Database | **Postgres** |
| Cache + simple queue + locks | **Redis** |
| Background jobs | **Sidekiq** (Ruby) / **Celery** (Python) / **BullMQ** (Node) |
| Reverse proxy / load balancer | **Nginx** or managed (ALB, Cloudflare) |
| HTTP framework | **Rails / Django / Express / FastAPI / Spring Boot** |
| CDN | **Cloudflare** or **CloudFront** |
| File storage | **S3** |
| Email | **SES** or **Postmark** |
| Auth | **Auth0 / Clerk / Cognito** (don't roll your own) |
| Payments | **Stripe** (don't roll your own) |
| Observability | **Sentry + Datadog / Grafana Cloud** |
| Deploy | **ECS Fargate / App Runner / Heroku-style** |
| CI/CD | **GitHub Actions** |

The stack scales to **millions of users and $50M+ ARR** if engineered well. Most of those choices stay valid forever.

---

## What boring tech buys you

```
✓ Stack Overflow has answered every question someone will ask
✓ Hiring is easy ("we use Postgres" finds 100× more candidates than "we use Cockroach")
✓ Fewer "why doesn't this work?" hours
✓ Frameworks have edge cases solved
✓ Cloud providers offer managed versions
✓ Migration paths exist if you outgrow it
```

The cost of novel tech is hidden but real:
```
✗ Documentation gaps
✗ Smaller community = longer debug cycles
✗ Operational maturity not yet there
✗ Engineers leaving makes a niche stack worse
✗ Vendor risk (will this company exist in 5 years?)
```

---

## What you can do with the boring stack

### Postgres alone covers

```
- ACID transactions, foreign keys, joins
- JSON columns (often replaces a separate document DB)
- Full-text search with pg_trgm (acceptable for <10M docs)
- LISTEN/NOTIFY for simple pub/sub
- Partial indexes, generated columns, range types
- Time-series with TimescaleDB extension
- Vector search with pgvector
- Logical replication for CDC
- Row-level security for multi-tenancy
```

Postgres replaces "we need MongoDB + Elasticsearch + Redis for pub/sub" in most cases at small-to-mid scale.

### Redis alone covers

```
- Caching
- Session storage
- Rate limiting (atomic INCR with EXPIRE)
- Distributed locks (with care — see Redlock)
- Pub/Sub (small scale)
- Queues (LPUSH/RPOP or Streams)
- Leaderboards (sorted sets)
- Feature flags (hash)
```

Redis replaces 4-5 specialised services in early-stage systems.

### Sidekiq / Celery / BullMQ covers

```
- Background processing
- Scheduled jobs (cron-like)
- Delayed jobs (run X in 2 hours)
- Retries with backoff
- Dead-letter queues
```

Replaces "we need Kafka + a worker fleet" until your scale or replay needs genuinely demand it.

---

## Patterns the boring stack handles

| Pattern | Boring implementation |
|---|---|
| Background jobs | Sidekiq |
| Scheduled tasks | Cron table + Sidekiq, or `whenever` gem |
| Idempotency keys | Postgres unique constraint on a key column |
| Rate limiting | Redis token bucket |
| Caching | Redis with TTL |
| Pub/sub (small scale) | Postgres LISTEN/NOTIFY or Redis Pub/Sub |
| Search (small scale) | Postgres full-text search |
| File uploads | Presigned S3 URLs |
| Webhooks | Sidekiq with retry + DLQ |
| Outbox pattern | Postgres `events` table + worker poll |
| Saga (simple) | Sidekiq workflow chains |
| Audit log | Postgres append-only `events` table |
| Feature flags | LaunchDarkly free tier or Postgres flags table |
| A/B testing | Postgres assignments table |

This list covers the first 2-3 years of most products. Adding Kafka, Cassandra, or microservices is a *response to a specific pressure*, not a default starting point.

---

## When to graduate (the boring stack's limits)

Real signals you've outgrown boring tech, not "we want to play with X":

### Postgres → consider sharding or other database

```
✓ Sustained >50K writes/sec across the cluster (vertical scale exhausted)
✓ Single table over 5TB with no natural partitioning
✓ Write IOPS bottleneck on largest available disk
✓ Strict multi-region active-active writes needed
```

→ Sharded Postgres, Aurora, or DynamoDB / CockroachDB.

### Postgres LISTEN/NOTIFY → real pub/sub

```
✓ More than ~1K events/sec sustained
✓ Need replay / history
✓ Multiple consumer groups with independent positions
```

→ Kafka, Kinesis, or Pulsar.

### Postgres full-text → search engine

```
✓ More than ~10M documents
✓ Complex ranking, faceting, fuzzy matching
✓ Sub-100ms search latency at scale
```

→ Elasticsearch, OpenSearch, or Algolia.

### Redis cache → distributed caching

```
✓ More than ~50GB working set
✓ Multi-region requirement
✓ Single Redis primary CPU bottlenecked
```

→ Redis Cluster, ElastiCache cluster mode, DAX.

### Sidekiq / Celery → real streaming

```
✓ More than ~10K jobs/sec sustained
✓ Need exactly-once semantics
✓ Need replay-able event log
✓ Multi-consumer with independent offsets
```

→ Kafka / Kinesis with stream processors.

### Modular monolith → microservices

```
✓ Team size >50 engineers
✓ Genuinely different scaling profiles per module (1000× difference)
✓ Polyglot stack mandated
✓ Independent deploy cadence is a real bottleneck
```

→ Carefully split services along bounded contexts.

---

## The contrast: "exciting" tech in early stage

Common mistakes from picking exciting over boring:

### Microservices day-1 (5-person team)

```
What happens:
  - 10 services to deploy, monitor, debug
  - Most engineering time goes to ops, not features
  - Cross-service issues dominate
  - Velocity slower than monolith would have been
  
Better start: modular monolith with bounded contexts.
Future: split out services when scale or org demands it.
```

### Kafka for 100 events/sec

```
What happens:
  - $300/month minimum for a small Kafka cluster
  - Need to operate it: zk/KRaft, brokers, schema registry
  - SQS or Redis would handle this for $10/month
  
Better start: SQS or Redis. 
Future: Kafka when replay/multi-consumer becomes essential.
```

### Kubernetes for 1 service

```
What happens:
  - Hours/days configuring helm, ingress, networking
  - Operational burden bigger than your feature backlog
  - $73/month for EKS control plane just to start
  
Better start: ECS Fargate or App Runner.
Future: K8s when you have many services + need K8s ecosystem.
```

### DynamoDB "for scale" with 1000 RPS

```
What happens:
  - Access pattern doesn't fit single-table design
  - Joins become application-level lookups
  - Analytics is a problem (export to S3 + Athena)
  - Schema migrations are awkward
  
Better start: Postgres handles 1000 RPS without effort.
Future: DynamoDB when you have a clear access pattern + need >10K RPS at low latency.
```

### NoSQL "because schema-less"

```
What happens:
  - 3 years in, you have de facto schemas without enforcement
  - Bug-induced corrupt records lurk for months
  - Reporting queries are slow / impossible
  
Better start: Postgres JSONB columns. Schema flexibility + integrity.
```

---

## The discipline

Choosing boring takes active effort because:

```
Engineers want resume-driven development
  → Boring tech doesn't make a flashy CV bullet

Conferences and blog posts emphasise novel tech
  → "We rewrote our backend in Rust" gets clicks
  → "We're still on Postgres after 8 years" doesn't

Vendors push their products
  → "You need our specialised database" is a sales pitch
  → "Postgres handles this fine" doesn't sell SaaS

It feels like progress
  → Adopting a new tool feels like advancement
  → Reality: it's just new debt
```

The discipline: **innovation budget is finite — spend it where it matters**. Most products' competitive edge isn't infrastructure; it's the product itself. Don't burn the budget on tooling.

---

## When boring tech is wrong

Boring isn't always right:

- **Specialised workloads**: real-time bidding, financial trading, genomics — these need specialised stacks
- **Genuine scale**: when you're past the boring stack's limits, graduate
- **Compliance / regulatory**: sometimes the boring choice doesn't meet requirements
- **Specific vendor-lock-in needs**: cloud-native choices that buy you something specific
- **Greenfield with right team**: if the team has deep expertise in a specific stack, that's their boring

The point isn't "always pick the oldest tool." It's: **be honest about whether the new tool earns its complexity**.

---

## Quick test

When picking a tool, ask:

```
1. What problem does this solve that the boring choice doesn't?
2. Are we actually hitting the boring choice's limits, or just imagining we will?
3. What's the operational cost of operating this new tool 24/7 for 5 years?
4. Who on the team has run this in production?
5. If the one person who knows this leaves, how screwed are we?
```

If the answers are "vague performance hand-waves," "we might hit it eventually," "no idea," "no one yet," and "very" — pick the boring choice.

---

## When boring tech graduates (the natural evolution)

This isn't "boring forever." Natural growth:

```
Year 1:    Modular monolith on Heroku-style. Postgres + Redis + Sidekiq.
Year 3:    Same, but on ECS Fargate or Kubernetes. Read replicas.
Year 5:    Some services extracted. Kafka for one specific use case.
Year 7:    Microservices for a few high-pressure areas; monolith for the rest.
Year 10:   Specialised stacks per domain. Boring at the company level becomes "what we always used."
```

Boring tech *evolves into* a more complex stack, driven by real pressures. The goal is to not jump to year-7 architecture in year-1.

---

## Recommended reading

- Dan McKinley, "Choose Boring Technology" — boringtechnology.club
- Hillel Wayne, "I've Seen Things" — on the limits of boring
- "Choose Boring Technology in 2020" — updated reflection
- This repo's [Modular Monolith](../architecture/modular-monolith.md), [Architecture Anti-Patterns](../architecture/anti-patterns.md), and [Architecture Styles Comparison](../architecture/styles-comparison.md)

---

## Related

- [Modular Monolith](../architecture/modular-monolith.md) — the boring architecture default
- [Architecture Anti-Patterns](../architecture/anti-patterns.md) — the cargo-cult failures
- [Capacity Planning](../architecture/capacity-planning.md) — sizing the boring stack
- [Building a SaaS path](../paths/building-saas.md) — boring stack in practice
- [Quality Attributes](../architecture/quality-attributes.md) — the trade-off framework
