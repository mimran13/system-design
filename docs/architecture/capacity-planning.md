# Capacity Planning & Architecture Sizing

Capacity planning bridges architecture and operations: estimate how much load a system will handle, size the infrastructure to fit, and verify the architecture can scale to projected demand. Done right, you avoid emergencies; done badly, you either over-provision (waste) or under-provision (incidents).

---

## What capacity planning answers

```
1. How many requests/sec, transactions/day, GB stored, etc?
2. How much compute, memory, storage, bandwidth do we need?
3. How does this scale at 2×, 10×, 100× current load?
4. What's the bottleneck before that point?
5. What does it cost?
```

These questions feed both architecture decisions ("can we use a single Postgres or do we need sharding?") and budgets.

---

## Back-of-the-envelope estimation

Start with rough orders of magnitude:

```
Daily Active Users:                10M
Requests per user per day:          50
Total requests per day:            500M
Peak: 3× average → peak QPS:       17K
Average request size:              5 KB
Daily ingress:                     2.5 TB
```

These numbers drive everything else. See [Back-of-Envelope Estimation](../fundamentals/estimation.md).

---

## Estimate work first, hardware second

Common mistake: jumping to "we need 50 servers." Start with:

| Question | Why |
|---|---|
| What's the operation rate? | QPS, writes/sec, events/sec |
| What's the data volume? | GB stored, GB/day ingested |
| What's the data growth? | GB/year, retention requirements |
| What's the access pattern? | Read-heavy / write-heavy / mixed |
| What's the consistency requirement? | Strong / eventual / per-operation |
| What are the latency targets? | p50, p95, p99 |

Then translate to hardware via known unit costs.

---

## Unit economics

For each architectural building block, know roughly:

```
PostgreSQL (well-tuned, single primary):
  Reads:  10K-50K QPS
  Writes: 5K-20K QPS
  Storage: ~10 TB practical
  
Redis (single instance):
  Ops/sec: 100K-1M
  Memory: ~64 GB practical
  
Kafka (per broker):
  Throughput: 100-500 MB/s sustained
  Storage: limited by disk
  
ElasticSearch (per node):
  Index size: 50-100 GB / shard
  Search QPS: ~500-1000 / shard
  
Cassandra (per node):
  Writes: 10K-30K / sec
  Reads: 5K-15K / sec
  Storage: 1-5 TB
  
Single application server (8 vCPU, 16 GB):
  HTTP requests: 5K-20K QPS for simple endpoints
  
S3:
  Read: 5500 GET/sec per prefix (default; partition for more)
  Write: 3500 PUT/sec per prefix
```

These are very rough — depend on workload, hardware, configuration. They're starting points for "do we need 1, 10, or 100 nodes?"

---

## The sizing formula

For each component:

```
Required capacity = (Peak load × headroom factor) ÷ per-unit capacity

Round up; favour fewer larger units to reduce coordination cost.
```

Headroom factor is typically 1.5-3×:

- Account for traffic spikes
- Allow individual instance failures without overload
- Cover load during deploys / restarts
- Provide capacity for growth between scaling events

```
Peak: 17K QPS
Per-server capacity: 5K QPS
Required = 17K × 2 / 5K = 6.8 → 7 servers
```

Run at 50-70% utilisation in steady state. Above that, latency starts climbing (queuing theory) and you have no spike capacity.

---

## Storage sizing

Three components per item: payload + indexes + replication.

```
50M orders × 1 KB each = 50 GB raw
Plus indexes (typically 30-50% of data): +20 GB
Plus replication (3 replicas): ×3 → 210 GB
Plus growth (5 years): ~1 TB
Plus headroom (50%): ~1.5 TB total provisioned
```

For OLAP / time-series:

```
1B events/day × 200 bytes = 200 GB/day
Compressed (5×): 40 GB/day
Retention: 30 days hot, 1 year warm, 7 years cold
Hot tier:   1.2 TB
Warm tier:  14 TB
Cold tier:  100 TB
```

Tiered storage saves money — hot data on SSD, warm on HDD, cold on glacier-style archival.

---

## Bandwidth sizing

```
Egress to clients:
  10M users × 50 requests × 50 KB response = 25 TB / day

Inter-service traffic:
  Often 5-10× the external traffic
  Big driver: chatty microservices
  
Database replication:
  All writes × number of replicas
  Cross-region replication = WAN bill
```

Bandwidth is often a forgotten cost — egress charges from cloud providers add up. Plan for 1.5-3× the obvious number.

---

## Memory sizing

Each component has typical memory needs:

```
Application:     ~100 MB-2 GB per instance
JVM:             heap + metaspace + native = 1.5× heap
Database (innodb): buffer pool 60-75% of RAM
Redis:           data + ~30% overhead for connections, structures
Search engine:   indexed data fits in RAM for hot portions
```

For caching: cache hit rate determines memory need. 80% hit rate of a 1 TB working set → ~200 GB cache. Always profile actual hit rate, not estimate.

---

## Concurrency sizing

How many concurrent operations the system supports.

```
Connection limits:
  Postgres:    100-500 concurrent connections (use PgBouncer for more)
  Redis:       10K+
  Web server:  1K-100K (depends on async/sync model)
  
Thread pools:
  Sized to ~CPU count for CPU-bound
  Sized to allow blocking + waiting for I/O-bound (200, 500, 1000)
```

See [Connection Pooling](../patterns/connection-pooling.md).

---

## Capacity planning over time

Static plan ≠ accurate forever. Iterate:

```
Quarterly:
  - Review actual usage vs forecast
  - Adjust forecast based on actual growth
  - Identify components nearing capacity (>70%)
  - Plan scaling work

Monthly:
  - Monitor utilisation trends
  - Watch for hotspots, anomalies

Continuously:
  - Auto-scaling for predictable variation
  - Alerting on capacity thresholds
```

A "set and forget" plan from launch becomes wrong within 6 months for any growing product.

---

## Auto-scaling

Match capacity to load dynamically:

```yaml
# Kubernetes HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  minReplicas: 5
  maxReplicas: 50
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

Caveats:

- **Cold start** matters — new instances may take 30s-2min before serving traffic
- **Scale-down** should be slower than scale-up (avoid flapping)
- **Custom metrics** often better than CPU (e.g., queue depth)
- **Predictive scaling** (scheduled bumps) for known patterns

Auto-scaling solves smooth growth; it doesn't solve sudden spikes (those need pre-provisioned headroom).

---

## Load testing

Verify capacity assumptions before incidents.

```
Tools:
  k6, Gatling, Locust, JMeter, wrk2
  
Levels:
  Smoke: small load to verify functionality
  Load:  expected load for sustained duration
  Stress: beyond expected to find breakpoint
  Soak:  hours/days at expected load to find slow leaks
  Spike: sudden burst to test elasticity
```

Find:

- Maximum sustainable QPS before latency spikes
- Behaviour at the knee of the latency curve
- What breaks first (CPU? memory? DB connections? downstream service?)

The result feeds capacity planning ("server X handles 5K QPS at p99 < 100ms").

See [USL & Amdahl's Law](../fundamentals/throughput-limits.md) for why throughput peaks then declines.

---

## Cost modelling

Each architectural choice has a cost shape:

```
Compute:
  Reserved instances:  cheap, must commit
  On-demand:           expensive, full flexibility
  Spot/preemptible:    cheapest, can be interrupted
  Serverless:          pay per request, no idle cost

Storage:
  Hot SSD:            $$$ per GB-month
  Warm HDD:           $ per GB-month
  Cold archival:      ¢ per GB-month, $ per retrieval

Network:
  Inter-AZ:           free or $0.01/GB
  Inter-region:       $0.02-0.09/GB
  Egress to internet: $0.05-0.15/GB
```

Rule of thumb on AWS:

- **Compute** is 30-50% of bill
- **Storage + database services** another 20-30%
- **Egress** is 10-30% (often a surprise)
- **Other managed services** the rest

Run cost models alongside capacity models. A "scalable" architecture that costs $50K/month for $5K of revenue is a problem.

---

## Multi-region multipliers

Multi-region architectures double or triple costs:

```
Active-active:        2-3× compute + storage + bandwidth
Active-passive:       1.2-1.5× (hot standby smaller)
Read replicas only:   1.3-1.7×
```

Plus:

- Cross-region replication bandwidth
- Cross-region operations (backups, DR drills)
- Operational complexity (ops teams in multiple TZs)

Multi-region is a quality attribute trade-off — cost for availability + latency. Earn it; don't default to it.

---

## Sizing examples

### Small SaaS (1K customers, B2B)

```
Compute:    3 web servers (HA), 2 background workers
Database:   1 RDS Postgres + 1 read replica (1 TB total)
Cache:      1 Redis (4 GB)
Storage:    100 GB S3 for files
CDN:        Cloudfront in front
Total cost: ~$2-5K / month
```

A modular monolith on managed services; massive headroom; simple to operate.

### Mid-stage product (1M users)

```
Compute:    20-50 instances behind ALB; auto-scaled
Database:   RDS Postgres primary + 3 replicas + Aurora for some workloads
Cache:      ElastiCache cluster (50 GB)
Queue:      SQS / Kafka (3-broker cluster)
Storage:    50 TB S3
Search:     ElasticSearch cluster (3 nodes)
Multi-AZ:   Yes (single region)
Total cost: ~$30-100K / month
```

### Large product (100M users)

```
Compute:    Hundreds to thousands of instances; multi-region
Database:   Sharded by tenant or hash; multiple datastores
Cache:      Per-region Redis clusters
Queue:      Multi-region Kafka
Storage:    Petabytes across S3 with tiering
Search:     Sharded ElasticSearch / Elasticsearch service
Multi-region: Active-active with global LB
Total cost: ~$1M+ / month
```

These are very rough. Real numbers depend heavily on architecture choices, vendor contracts, optimisation effort.

---

## Common mistakes

| Mistake | Consequence |
|---|---|
| Sizing for average, not peak | Outage when peak hits |
| Ignoring data growth | Storage runs out |
| Forgetting bandwidth costs | Surprise AWS bill |
| Auto-scaling without warming | Slow response during scale-up |
| Assuming dependencies scale linearly | Bottleneck in shared services |
| No load testing | Find capacity limits during incidents |
| Multi-region by default | Pay 3× for availability you don't need |
| Sizing once, never revising | Plan goes stale within months |

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you can size a system end-to-end with realistic numbers, not just say "we'll auto-scale."

**Strong answer pattern:**
1. Estimate work (QPS, GB, growth) before estimating hardware
2. Use unit economics: each building block has a known capacity range
3. Run at 50-70% utilisation; leave headroom for spikes and failures
4. Auto-scale predictable variation; pre-provision for spikes
5. Load test to validate assumptions; revise quarterly
6. Cost model alongside capacity — both feed architecture choices

**Common follow-up:** *"How would you size for Black Friday traffic that's 10× normal for 4 hours?"*
> Three layers. (1) Pre-warm capacity 24h ahead — auto-scaling reacts to load, not anticipates it. (2) Cache aggressively — most BF traffic is read-heavy product browsing. (3) Degrade gracefully — drop non-essential features (recommendations, analytics writes) under extreme load. Test the plan in pre-prod with simulated load. After: review what bottlenecked first; the 10× spike teaches you something the 1× operation didn't.

---

## Related topics

- [Back-of-Envelope Estimation](../fundamentals/estimation.md) — order-of-magnitude work
- [Numbers Every Engineer Should Know](../fundamentals/numbers-to-know.md) — operation costs in time
- [Throughput Limits](../fundamentals/throughput-limits.md) — Amdahl/USL on scaling
- [Quality Attributes](quality-attributes.md) — what to optimise for
- [Scalability](../fundamentals/scalability.md) — broader scaling discussion
