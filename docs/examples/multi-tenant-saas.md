# Multi-Tenant SaaS — Practical Examples

Scenarios where one product serves many customers (tenants) with shared or isolated infrastructure. The common thread: **balancing efficiency (sharing) with isolation (safety, compliance, performance fairness)**.

---

## Scenario 1: SaaS database — pooled, siloed, or hybrid

**Concrete situation**: B2B SaaS with 10,000 tenants. Some tenants have 1MB of data; some have 1TB. Some are highly regulated (HIPAA, SOX). Performance must be fair — one tenant shouldn't slow others.

### Reasoning

Three models exist:

- **Pooled (shared DB, shared schema, `tenant_id` column)**: cheapest, simplest scaling, easiest to query across tenants
- **Bridge (shared DB, schema-per-tenant)**: middle ground; some isolation
- **Siloed (DB-per-tenant)**: maximum isolation, expensive, complex

Most real SaaS uses **pooled by default**, with **siloed for top-tier customers** (regulated, very large, paying premium).

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Multi-Tenancy](../architecture/multi-tenancy.md) | Pattern catalogue |
| [Hot Partitions](../fundamentals/hot-partitions.md) | One huge tenant = hot partition in pooled model |
| [Sharding](../patterns/sharding.md) | Shard by tenant_id; route queries |
| [Database Indexes](../fundamentals/database-indexes.md) | Composite index on `(tenant_id, ...)` mandatory |
| [Caching Strategies](../caching/caching-strategies.md) | Per-tenant cache to avoid cross-tenant pollution |

### Sketch

```
Pooled (default for 99% of tenants):
  One Postgres cluster
  Every table has tenant_id column
  Every query filters: WHERE tenant_id = $current_tenant
  Composite index: (tenant_id, ...other_keys)
  Row Level Security (RLS) policy enforces tenant_id automatically

Siloed (premium / regulated tenants):
  Dedicated Postgres instance per tenant
  Tenant data NEVER mixes with others
  Operational cost: ~$50/month per tenant
  Limit to ~100 siloed tenants per cluster, otherwise mgmt nightmare

Hybrid routing:
  Tenant lookup table: tenant_id → cluster_id, db_name
  Connection pooler routes per request
```

### Trade-offs

- **Pooled**: cheap, easy to scale, but noisy-neighbour risk; harder data residency; one bug leaks across tenants
- **Siloed**: expensive ($50+/tenant), complex deployments, but safe; strict isolation; easy tenant deletion
- **Hybrid**: best of both, complexity of routing; needs solid tenant-management tooling

### Anti-patterns to avoid

- ❌ Forgetting `WHERE tenant_id = ...` in even ONE query → data leak across tenants
- ❌ App-layer-only enforcement of tenant_id (no RLS) → bug in app = leak
- ❌ Siloed for every tenant (10K databases) → ops nightmare
- ❌ Composite indexes without tenant_id first → full scan within tenant filter
- ❌ Cross-tenant analytics done by joining all tenants' data live → expensive; use ETL

### Variations

- **Per-region tenancy** (GDPR): `tenant_id → region` mapping; database-per-region; tenant data physically in their region
- **Tenant-specific encryption**: customer-managed keys per tenant (CMK)
- **Tenant lifecycle ops**: create / delete / clone — pooled means scrubbing; siloed means dropping a DB

---

## Scenario 2: Noisy neighbour — one tenant melts the system for everyone

**Concrete situation**: SaaS with thousands of tenants on shared infrastructure. One enterprise tenant runs a massive bulk import → CPU pegged, queries slow for everyone, alarms firing.

### Reasoning

- **Resource isolation** is the answer — limit per-tenant CPU, memory, IOPS, query rate.
- **Connection-level limits** (one tenant can use at most N DB connections from the pool).
- **Workload classes**: tenant tier (free / pro / enterprise) maps to limits.
- **Fair queuing**: when contention exists, allocate fairly across tenants, not first-come-first-served.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Bulkhead](../patterns/bulkhead.md) | Per-tenant resource pool prevents one tenant exhausting shared pool |
| [Rate Limiting](../patterns/rate-limiting.md) | Per-tenant request rate / token bucket |
| [Hot Partitions](../fundamentals/hot-partitions.md) | A noisy tenant IS a hot partition |
| [Multi-Tenancy](../architecture/multi-tenancy.md) | Tier-based isolation strategies |
| [Quality of Service](../patterns/circuit-breaker.md) | Different tiers, different SLAs |

### Sketch

```
API gateway / app layer:
  Per-tenant rate limit: token bucket in Redis
    free tier: 100 req/s
    pro tier: 1000 req/s
    enterprise: 10000 req/s
  Reject or queue when exceeded (HTTP 429)

Connection pool (PgBouncer):
  Per-tenant max_connections via separate pool per tier
  Free tier: 5 connections shared across all free tenants
  Enterprise: 50 connections per enterprise tenant

Background jobs / async work:
  Per-tenant worker queue (Sidekiq / Celery namespace)
  Round-robin processing across tenants
  Optional: dedicated workers for top-tier tenants

Data plane:
  Big tenants (>1TB) get dedicated DB shard
  Heavyweight queries: schedule during off-peak; tier-based
```

### Trade-offs

- **What you gain**: one tenant's load can't take down others; fair experience across tier
- **What you give up**: complexity in tier configuration; harder to provide great experience to free tier
- **Cost**: minimal; mostly software engineering effort

### Anti-patterns to avoid

- ❌ No rate limiting at all → first tenant to hammer wins, others starve
- ❌ Global rate limit only → single noisy tenant exhausts global budget
- ❌ Per-IP rate limit instead of per-tenant → one tenant has many IPs, abuses
- ❌ Hard partitioning of resources unconditionally → unused resources go to waste; no flexibility

---

## Scenario 3: Per-region tenancy for GDPR / data residency

**Concrete situation**: SaaS expanding to EU. EU customers' data must stay in EU per GDPR; some require data NEVER leaves country (Germany particularly strict). US customers continue in us-east-1.

### Reasoning

- **Per-tenant region** is the common solution. Each tenant has a "home region"; their data lives only there.
- **Routing layer** sends requests to the right region based on tenant.
- **Cross-region operations** (admin, billing, analytics) need careful handling — typically aggregate **without** moving data.
- **Backup, encryption keys** must also stay in-region.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Multi-Region Architecture](../architecture/multi-region.md) | Per-region deployment |
| [Multi-Tenancy](../architecture/multi-tenancy.md) | Tenant routing |
| [Sharding](../patterns/sharding.md) | Sharding by region |
| [Edge Architecture](../architecture/edge-architecture.md) | Routing/lookup at edge |

### Sketch

```
Tenant lookup (global, replicated to all regions):
  tenant_id → home_region
  Stored in tiny global table (DynamoDB Global Tables, Spanner)

Request flow:
  Client → CDN edge → tenant_id from subdomain or token
  Edge looks up home_region → forward to that region's API
  Region serves request entirely; tenant data never leaves

Per region:
  - Full app stack (compute, database, cache, storage)
  - Region-local backups
  - Region-local KMS keys

Cross-region:
  - Audit log streamed to global archive (with redaction if needed)
  - Aggregated metrics (counts, no PII) → global dashboard
  - Customer support: regional access only; agents work in tenant's region
```

### Trade-offs

- **What you gain**: legal compliance with data residency; EU customers feel ownership of their data; some perf benefits from locality
- **What you give up**: 2-3× infrastructure cost (full stack per region); operational complexity (deploys, observability across regions); cross-tenant analytics harder
- **Cost**: 2 regions = 2× cost; 5 regions ~= 4-5× cost

### Anti-patterns to avoid

- ❌ Single global database, "everyone in us-east-1" → not GDPR-compliant
- ❌ Cross-region database replication of EU data to US → moves data, defeats residency
- ❌ Forgetting backups need same residency rules
- ❌ Forgetting that *encryption keys* are also subject to residency rules
- ❌ Cross-region admin tooling that pulls customer data — admin can violate residency

---

## Scenario 4: Tenant onboarding — provisioning a new customer in seconds

**Concrete situation**: Self-serve signup. A new tenant signs up; they expect a working environment within 30 seconds — schema, default config, sample data, sub-domain, encryption keys.

### Reasoning

- **Manual provisioning** doesn't scale beyond 10 tenants/day.
- **Async onboarding workflow** (saga) handles all the steps.
- **Idempotency** matters because retries on signup failure shouldn't create duplicate tenants.
- **Database schema setup**: pooled = no setup; bridge/siloed = run migrations at provision time.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Saga Pattern](../patterns/saga-pattern.md) | Multi-step provisioning workflow |
| [Idempotency](../patterns/idempotency.md) | Retry-safe |
| [IaC for tenant infra](../iac/index.md) | Terraform per-tenant resources if siloed |
| [Choreography vs Orchestration](../architecture/choreography-vs-orchestration.md) | Orchestrator drives the explicit workflow |
| [Multi-Tenancy](../architecture/multi-tenancy.md) | Tenant model determines what to provision |

### Sketch

```
Signup form → POST /signup
   │
   ▼
Create tenant_id
Insert into tenants table (status=provisioning)
Start onboarding workflow (Temporal / Step Functions):

  Step 1: Create tenant in identity provider (Auth0, Cognito)
            compensate: delete tenant on failure
  Step 2: Run database migrations for tenant's schema (if bridge)
            compensate: drop schema
  Step 3: Provision per-tenant secrets (encryption keys in KMS)
            compensate: delete keys
  Step 4: Create default config / seed data
            compensate: delete tenant data
  Step 5: Configure tenant subdomain / DNS
            compensate: remove DNS record
  Step 6: Send welcome email
            no compensation (email OK to fail)
  Step 7: Mark tenant active

Total time: 5-30 seconds
On failure: workflow rolls back; user sees friendly error; can retry
```

### Trade-offs

- **What you gain**: fully automated, observable, retryable provisioning; failures don't leave half-created tenants
- **What you give up**: workflow engine to operate; complexity of compensating actions
- **Cost**: minimal; Temporal Cloud or Step Functions

### Anti-patterns to avoid

- ❌ Synchronous provisioning in the signup HTTP request → 30s of waiting; timeouts; partial failures
- ❌ Best-effort provisioning with no rollback → orphaned KMS keys, DNS records, etc., accumulating
- ❌ Manual ops review for new tenants → not scalable
- ❌ Tenant creation as a single DB transaction across services → 2PC, fragile

---

## Common pitfalls across multi-tenant scenarios

| Pitfall | Mitigation |
|---|---|
| Cross-tenant data leak via missing filter | RLS, tenant_id mandatory in every index |
| One tenant's bug blocks another's progress | Bulkhead, per-tenant queues |
| Pooled by default, then a tenant grows huge | Tooling to migrate tenant from pooled → siloed |
| Cross-region admin operations violate residency | Strict regional admin scope; audit logs |
| Tenant deletion is incomplete → orphaned data, GDPR risk | Tenant deletion saga that cascades through every store |
| Billing per tenant requires aggregating usage | Per-tenant metric tags from day one |

---

## Related

- [Multi-Tenancy](../architecture/multi-tenancy.md)
- [Bulkhead](../patterns/bulkhead.md)
- [Rate Limiting](../patterns/rate-limiting.md)
- [Multi-Region Architecture](../architecture/multi-region.md)
- [Saga Pattern](../patterns/saga-pattern.md)
- [Hot Partitions](../fundamentals/hot-partitions.md)
