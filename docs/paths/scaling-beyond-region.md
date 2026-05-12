# Reading Path: Scaling Beyond One Region

10 pages for going global. Covers multi-region architectures, edge compute, data residency, eventual consistency, and the cost realities of operating globally.

Aimed at: architects and senior engineers considering multi-region, or operating products with global users. Assumes the [Building a SaaS path](building-saas.md) or equivalent experience.

---

## When you need this path

Three legitimate drivers:

```
1. Global users complaining of latency
   EU users: 300ms+ from us-east-1 → real perf impact
   
2. Disaster recovery
   AWS region outages happen yearly; you need to survive them
   
3. Data residency / regulatory
   GDPR, China, India localisation laws
```

If none of these apply, **don't go multi-region**. Cost is 2-3×; complexity is much higher. The path also covers when NOT to.

Estimated time: **~3 hours of reading**.

---

## The path

### Layer 1: Decide what you actually need (45 min)

| # | Page | Why it's here |
|---|---|---|
| 1 | [Multi-Region Architecture](../architecture/multi-region.md) | The four configurations: single, active-passive, active-active, read-replicas-only. Each has very different cost and complexity. |
| 2 | [CAP Theorem](../fundamentals/cap-theorem.md) | Cross-region network partitions are the rule, not the exception. CAP is real now. |
| 3 | [Consistency Models](../fundamentals/consistency-models.md) | What "eventual" actually means across regions |

### Layer 2: Patterns for multi-region (45 min)

| # | Page | Why it's here |
|---|---|---|
| 4 | [Replication](../patterns/replication.md) | The mechanism — sync vs async; leader-follower vs multi-leader |
| 5 | [CRDTs](../distributed/crdts.md) | For active-active conflict resolution without coordination |
| 6 | [Quorum (R+W>N)](../distributed/quorum.md) | When some regions can fail and reads/writes still work |

### Layer 3: Edge compute as a complement (30 min)

Sometimes the answer isn't "another region" — it's "compute at the CDN edge."

| # | Page | Why it's here |
|---|---|---|
| 7 | [Edge Architecture](../architecture/edge-architecture.md) | Cloudflare Workers, Lambda@Edge, Vercel Edge |
| 8 | [CDN](../networking/cdn.md) | The foundation edge compute sits on |

### Layer 4: Data residency and ops (30 min)

| # | Page | Why it's here |
|---|---|---|
| 9 | [Multi-Tenancy](../architecture/multi-tenancy.md) | Per-tenant region for GDPR is the common solution |
| 10 | [Capacity Planning & Sizing](../architecture/capacity-planning.md) | Multi-region costs 2-3× — plan it |

---

## The four configurations — choosing

```
Single region (baseline):
  Cost:        1×
  Latency for far-away users: 200-400ms
  DR:          Backup-only; outage = downtime
  Use when:    Modest user base, not regulated, can tolerate region outage

Active-passive (warm standby):
  Cost:        1.2-1.5×
  Latency:     Same as single region for users near primary
  DR:          Failover in minutes; some data loss possible
  Use when:    DR is the goal; latency isn't

Active-active:
  Cost:        2-3×
  Latency:     ~Sub-50ms anywhere
  DR:          Continuous; region failure = degraded but not down
  Use when:    Global latency or hard DR requirement justifies the cost

Read-replicas-only:
  Cost:        1.3-1.7×
  Latency:     Read fast everywhere; writes go to primary region (slower far away)
  DR:          Partial; primary failure still requires failover
  Use when:    Read-heavy workload with global users; OK to write through primary
```

---

## The cost reality

Multi-region surprises teams with how expensive it gets:

```
Single region AWS bill: $50K/month
  → Active-passive (warm): $60-75K/month (1.2-1.5×)
  → Active-active (2 regions): $100-150K/month (2-3×)
  → Active-active (3 regions): $150-200K/month (3-4×)
  
Plus:
  - Cross-region replication bandwidth: $0.02-0.09/GB
  - Cross-region operational complexity: 2-3× ops team effort
  - Global LB / DNS: ~$1K-5K/month
  - Audit / compliance overhead per region
  
Compound effect: 3-region active-active for a $50K/month single-region product
                 typically lands at $200-300K/month total.
```

---

## Common multi-region patterns

### Per-record region ownership (the cleanest active-active)

```
Every record has a "home region"
  Write requests for that record always route to home region
  Reads can come from any region (with replication lag)
  No write conflicts — only one region writes any given record
```

Used by: many SaaS products with per-user/per-tenant regions. The standard for GDPR.

### Global database with sync replication

```
Spanner, CockroachDB, YugabyteDB
  Synchronous quorum across regions
  Strong consistency globally
  Cost: high write latency (cross-region RTT in critical path)
```

Used when strong consistency is non-negotiable: finance, inventory at scale.

### Read replicas only

```
Single primary region accepts writes
  N read replicas in other regions
  Local reads fast; writes traverse to primary
  No write conflicts; partial DR
```

Used when: read-heavy workload (analytics dashboards, content delivery).

### Edge compute + regional backend

```
Edge handles: auth, personalization, simple transformations
Regional backend handles: heavy logic, source-of-truth writes
Edge caches reads aggressively; writes call regional
```

Used by: most modern web products. Cheap, latency-effective.

---

## When NOT to go multi-region

- You're not regulated → use single region with cross-region backup
- Users are concentrated in one geography → single region close to them
- Cost matters → multi-region is 2-3× the bill
- Team isn't operationally ready → multi-region is a senior-level operation
- You haven't optimised single-region yet → caching + CDN gets you 80% there

Multi-region is the answer to specific problems, not a general scaling tool.

---

## The data residency special case

GDPR, China, India localisation, healthcare in various countries. Different from multi-region for latency:

```
Multi-region for latency:
  Same tenant's data CAN exist in multiple regions (replicated)
  
Multi-region for residency:
  Tenant's data MUST stay in one specific region
  Backups, encryption keys, admin access — all subject to residency
  Cross-region operations must NOT move tenant data
```

The architecture pattern: **per-tenant region**. Tenant signs up → assigned a home region → all their data lives there only.

See [Multi-Tenancy](../architecture/multi-tenancy.md) for the operational model.

---

## Operational realities

```
Test failover regularly
  ─ Quarterly drill: simulate primary region outage
  ─ Run actual failover; measure time-to-recover
  ─ Without drills, your DR plan is hope

Monitor replication lag
  ─ Cross-region lag spikes during traffic spikes
  ─ Alert at >30s lag; investigate

Plan for split brain
  ─ What happens if a network partition makes both regions think they're primary?
  ─ Fencing tokens; leader election outside the cluster

Budget for bandwidth
  ─ Cross-region egress adds up; can be 20-30% of bill

Track per-region cost
  ─ Tag every resource with region + tenant
  ─ Review monthly
```

---

## Anti-patterns to avoid

| Anti-pattern | Problem |
|---|---|
| Going multi-region "for scale" without specific drivers | Burning money for nothing |
| Active-active without conflict-resolution strategy | Data corruption when conflicts arrive |
| Sync calls across regions in critical path | 100ms+ latency tax per request |
| Treating multi-region as "set and forget" | Failover atrophies; outage discovers it |
| Forgetting backups have residency rules too | Regulatory exposure |
| Mixed tenancy: some tenants pinned, some replicated | Operational nightmare |

---

## What's next

After this path:

- [Symptom → Concept Lookup](../reference/symptom-lookup.md) — for multi-region symptoms
- [Practical Examples → Multi-Tenant SaaS](../examples/multi-tenant-saas.md) — per-region tenancy scenario in detail
- [Case Studies](../case-studies/index.md) — full system designs

---

## Related

- [Multi-Region Architecture](../architecture/multi-region.md) — full deep-dive
- [Edge Architecture](../architecture/edge-architecture.md) — sometimes the better answer
- [CRDTs](../distributed/crdts.md) — conflict-free active-active
- [Capacity Planning](../architecture/capacity-planning.md) — sizing for global
