---
tags:
  - for-scale
  - for-saas
---

# Multi-Region Architecture

Most products start in one region. At some point — global users, disaster recovery, regulatory boundaries — multi-region becomes necessary. The architectural decisions split between **active-active** (every region serves traffic), **active-passive** (one primary, others standby), and various read-replica configurations. Each has very different cost, latency, and consistency profiles.

---

## You'll see this when...

- EU users complain of slow load (300ms+ from US-east region)
- GDPR / data residency: EU citizen data must stay in EU
- China requires local data; foreign companies operate via local partners
- AWS region outage took the whole product down — "we need DR"
- Compliance audit: "what's your business continuity plan?"
- Active-active with conflict resolution discussed (CRDTs, last-write-wins, per-record region)
- Spanner, CockroachDB, YugabyteDB chosen for multi-region SQL
- Cross-region replication bills surprised the team

---

## Why multi-region

| Driver | Implication |
|---|---|
| **Global user latency** | Serve users from a region near them |
| **Disaster recovery** | Survive regional cloud outages, natural disasters |
| **Regulatory** | Data residency (GDPR, China, India, Russia) |
| **Capacity scaling** | Distribute load beyond a single region's capacity |
| **Cost** (sometimes) | Different regions have different pricing |

Multi-region is expensive — 1.5-3× cost depending on architecture. Earn it; don't default to it.

---

## The four configurations

### 1. Single region (the baseline)

```
Region A: full stack, all traffic
Region B: nothing (or just backups)
```

Pros: simplest, cheapest, strong consistency.
Cons: regional outage = total outage; users far from region A see high latency.

### 2. Active-passive (warm standby)

```
Region A: serves all traffic
Region B: full stack idle, replicating data from A continuously
On A's failure: failover to B
```

Pros: simple data model (one writer); fast failover (already running).
Cons: B's resources mostly idle; failover is a real operational event.

### 3. Active-active

```
Region A: serves North/South America, owns its writes
Region B: serves Europe/Africa, owns its writes
Region C: serves Asia/Pacific, owns its writes
```

All regions serve traffic; data replicates between regions.

Pros: best latency for users (nearest region); regional outage = degraded but not down.
Cons: write conflicts; complex consistency; expensive (full stack ×3); cross-region replication bandwidth.

### 4. Read replicas only

```
Region A: full stack, accepts writes
Region B: read-only replica; reads served locally; writes forwarded to A
```

Pros: read scaling and read latency improvement; lower complexity than active-active.
Cons: writes still bottleneck on A; cross-region write latency; A's failure means write outage everywhere.

---

## The CAP problem in multi-region

Multi-region forces the [CAP](../fundamentals/cap-theorem.md) trade-off:

```
Network partitions BETWEEN regions are common (much more than within a region).
You must choose:
  - Consistency: writes only succeed when all regions agree (slow, may fail)
  - Availability: each region accepts writes; reconcile conflicts later
```

Pure choices:

- **Strong consistency**: tools like Spanner, CockroachDB use synchronous quorum across regions; latency cost is severe (50-300 ms write latency).
- **Eventual consistency**: each region writes locally; conflicts resolved by CRDTs, last-write-wins, or app logic.

Most products land somewhere in between — strong consistency for some operations, eventual for others.

---

## Routing traffic to regions

### DNS-based (latency or geolocation)

```
Route 53 latency policy:
  user in Singapore → resolves to ap-southeast-1
  user in Frankfurt → resolves to eu-central-1
```

Pros: simple, no client changes.
Cons: DNS caching means stale routing; ~5 minute granularity for failover.

### Anycast IP

```
One IP advertised from multiple regions
BGP routes user to the topologically nearest one
```

Pros: instant failover (BGP convergence); near-optimal latency.
Cons: more infrastructure; usually via a CDN or L4 load balancer (CloudFront, Cloudflare).

### Application-level routing

```
Client connects to global LB
LB returns redirect to nearest region
Client speaks to that region directly
```

Pros: can route on app-specific logic (sharding by user ID, etc.).
Cons: extra round-trip; client complexity.

---

## Data replication

### Async replication

```
Region A primary writes → asynchronously stream to B and C
B and C are seconds-to-minutes behind
```

Used for: read replicas, active-passive standby.

Risk: data loss window if A fails before replication completes.

### Sync replication

```
Write only succeeds when N regions have committed it.
Higher write latency (cross-region RTT).
```

Used for: financial data, strong consistency requirements.

Tools: Spanner, CockroachDB, YugabyteDB.

### Active-active replication patterns

| Strategy | How it works | Use |
|---|---|---|
| **Last-write-wins (LWW)** | Conflicts resolved by timestamp | Acceptable when conflicts are rare; lossy |
| **CRDTs** | Data structures that merge automatically | Counters, sets, registers |
| **Application-level reconciliation** | Custom logic detects and resolves conflicts | Most flexible; most work |
| **Per-record region ownership** | Each record has a "home region"; writes route there | Clean for partitioned data |

### Per-record region ownership

The cleanest active-active pattern when data partitions naturally:

```
User account: home region = where the user signed up
  All writes for that account go to home region
  Other regions cache reads
  
Avoids conflicts entirely — only one region writes any given record.
```

Used by: many SaaS products with regional users.

---

## Failure scenarios

### Single region degraded

Active-passive: failover to standby. Active-active: shed traffic from degraded region; serve from others.

### Cross-region network partition

Active-passive: standby and primary disconnect. Standby can serve reads but not become primary without a procedure. Risk of split brain.

Active-active: regions continue operating independently; conflict resolution kicks in when reconnected.

### Full region loss (rare but real)

```
us-east-1 outage of several hours: 2017, 2021, 2022
ap-northeast-1 (Tokyo) DC outage: 2019
us-west-2 partial outages: yearly
```

Multi-region survives this. Single region with backups recovers (eventually) but is down meanwhile.

---

## Data residency / regulatory

Some data must stay in specific regions:

- EU GDPR: EU citizen data should stay in EU regions
- China: data on Chinese citizens must stay in China; foreign companies operate via local partners
- India: certain data subject to localisation laws
- Healthcare: HIPAA US-only; varies by country
- Financial: regulator-specific rules

Architectural implication: **per-tenant region** rather than global active-active. Routes user → their tenant's region.

```
Sign up:
  EU user → tenant created in EU region
  US user → tenant created in US region

Login:
  User looks up tenant → routed to correct region
```

This is a stronger constraint than just latency. Once data is in a region, getting it out (even for backup) is regulated.

---

## Cost implications

```
Active-passive (warm):     1.2-1.5× single-region cost
Active-passive (cold):     1.05-1.1× single-region cost
Active-active 2 regions:    2-2.5× single-region cost
Active-active 3 regions:    3-3.5× single-region cost
Multi-region with localised tenants: 1.3-1.8× (less duplication)

Plus:
  Cross-region bandwidth: $0.02-0.09 per GB
  Cross-region replication: continuous data egress
  Operational complexity: 2-3× ops effort
  Testing: must test failover, conflict resolution, partition behaviour
```

Multi-region triples your AWS bill in many cases. The decision is usually driven by availability or latency requirements that are worth it — not by intuition.

---

## Patterns for specific workloads

### Stateless services

Easy. Deploy to N regions; route via DNS / anycast. Each region serves traffic independently.

### Read-heavy database workloads

Read replicas in each region. Writes go to primary (or per-record home region). Most reads served locally.

### Write-heavy with strong consistency

Synchronous multi-region quorum (Spanner, Cockroach). Pay the latency cost.

### Caching

Per-region cache; populated locally on miss. Cross-region cache invalidation hard — usually accept some staleness.

### Search / analytics

Per-region indices; or single-region with reads from anywhere. Trade-off based on data volume vs latency.

### Files / objects

Multi-region replication built into S3, GCS. Read from nearest region.

### Event streams

Per-region Kafka clusters mirrored to others (MirrorMaker, Cluster Linking). Or globally distributed (Confluent Cluster Linking, AWS MSK Replicator).

---

## Operational realities

```
1. Test failover regularly.
   Every quarter, simulate primary region failure.
   
2. Have a runbook.
   Failover should be one or two commands, not freestyle ops.

3. Monitor cross-region replication lag.
   When lag is high, the standby is less useful.

4. Test split brain scenarios.
   What happens if both regions think they're primary?

5. Plan for data residency drift.
   Tenants change regions; data must follow.

6. Budget for cross-region bandwidth.
   It's a recurring cost that surprises teams.

7. Account for clock skew.
   Cross-region clocks may differ by milliseconds.
```

---

## Anti-patterns

| Anti-pattern | Problem |
|---|---|
| Multi-region by default for new systems | Burning money on availability you don't need |
| Active-active without conflict strategy | Data corruption when conflicts arrive |
| Cross-region sync calls in critical path | 100+ ms latency tax on every request |
| Treating multi-region as "set and forget" | Failover practices atrophy; outage discovers it |
| Forgetting bandwidth costs | Surprise cloud bill |
| Mixing residency rules ("just put it all in one region") | Regulatory exposure |

---

## Migration: single → multi-region

It's hard. Approximate path:

```
1. Define why (latency, DR, regulatory) — sets architecture choice
2. Make the application stateless (or single-writer per record)
3. Add asynchronous replication for the database
4. Stand up the second region as read-only / passive
5. Validate failover under load
6. (For active-active) introduce conflict resolution; per-record home region
7. Roll out write activity to new region(s) gradually
8. Test, drill, document
```

Multi-region migration projects span months to years for non-trivial systems.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you understand multi-region as a serious architectural commitment, not a checkbox.

**Strong answer pattern:**
1. Multi-region is for global latency, DR, or data residency — pick one or more drivers
2. Configurations: single-region, active-passive, active-active, read-replicas-only — different cost/complexity
3. CAP applies between regions; pick consistency vs availability per workload
4. Per-record region ownership avoids most active-active conflicts cleanly
5. Test failover regularly; document runbooks; track replication lag
6. Budget 1.5-3× cost; expect months of migration work for existing systems

**Common follow-up:** *"How do you handle write conflicts in active-active?"*
> Easiest: avoid them. Per-record region ownership — each record has a home region where writes go; other regions read replicas. When unavoidable, options are CRDTs (for natural fit data like counters or sets), last-write-wins (acceptable if conflicts rare and lossy resolution OK), or application-level reconciliation (most flexible, most work). The right answer depends on the data type. For financial data, you'd use synchronous multi-region quorum to avoid conflicts entirely; for social-media-style data, LWW or CRDTs are usually fine.

---

## Related topics

- [Availability & Reliability](../fundamentals/availability.md) — what multi-region buys you
- [CAP Theorem](../fundamentals/cap-theorem.md) — partition trade-offs
- [Replication](../patterns/replication.md) — mechanism
- [CRDTs](../distributed/crdts.md) — conflict-free merging
- [Edge Architecture](edge-architecture.md) — global latency without full multi-region
- [Multi-Tenancy](multi-tenancy.md) — per-tenant region patterns
