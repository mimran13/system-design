---
tags:
  - applied
---

# Cost Engineering — FinOps in Practice

The discipline of treating cloud cost as a first-class engineering concern. At staff level, **the architecture decision that saves $50K/month** is often more valuable than the one that saves 10ms latency. This page covers FinOps practice, unit economics, spot strategies, egress battles, and the recurring patterns of cloud waste.

---

## Why cost is engineering's problem

```
Old world:    finance owned the budget; engineering "got compute"
Cloud world:  engineering decisions create costs daily

Provisioning a too-large instance:    $X/month forever
Forgetting to terminate dev resources: silent monthly drain
Cross-region traffic:                   surprise on the bill
Bad query patterns:                     scales with usage; compounds
```

At staff level, you make architecture decisions whose cost shape compounds over years. Knowing what's expensive vs cheap is a real skill.

---

## The FinOps practice

FinOps Foundation defines three phases that organisations cycle through:

```
1. Inform:    transparency — what do we spend on what?
2. Optimise:  spend less for same value
3. Operate:   continuous improvement; cost as a metric in engineering decisions
```

Most companies are stuck in Phase 1. Few make it to Phase 3 (continuous practice).

### Inform — visibility first

You can't optimise what you can't see.

```
Required tagging strategy:
  Every resource tagged with:
    - Environment (prod / staging / dev)
    - Team (which team owns this?)
    - Service (which service does this serve?)
    - Cost center (which budget?)
    - Project (optional; for shared resources)

Without tagging: bills are useless lump sums.
With tagging: precise attribution.
```

**Enforce tagging via IaC + AWS Service Control Policies (SCPs) / GCP Org Policies**. Untagged resources can't be created.

### Showback vs chargeback

```
Showback: "your team's services cost $X/month" — visibility only
Chargeback: "your team's budget is charged $X/month" — real money

Showback is easier to start; less politics.
Chargeback creates strong incentives but requires more mature finance integration.
```

Most companies start with showback. Move to chargeback for teams that own real budget.

### Unit economics — the real metric

Absolute cost is less useful than **cost per user / per request / per feature**.

```
"We spent $100K on AWS last month" — meaningless alone
"Cost per MAU: $0.12" — useful; track over time
"Cost per checkout: $0.003" — actionable
```

Track unit economics:

```
Engineering perspective:
  Cost / 1M API requests
  Cost / 1M DB queries
  Cost / 1TB data stored
  Cost / 1 hour of user time
  
Business perspective:
  Cost / monthly active user
  Cost / paid customer
  Cost / unit of revenue
  Cost / feature usage
```

Trends matter more than absolute numbers. **"Cost per MAU rising 5% per quarter" is an architectural problem**.

---

## Where the money actually goes

Typical SaaS cloud bill breakdown:

```
Compute:        30-40%   (EC2, ECS, Lambda)
Database:        15-25%   (RDS, DynamoDB, etc.)
Storage:         10-15%   (S3, EBS)
Egress:          10-30%   (the surprise; data transfer out)
Other services:  10-20%   (load balancers, CDN, monitoring, etc.)
Specialised:     varies   (GPU, ML services, analytics)
```

The variability in egress is what catches teams off-guard. A poorly-architected multi-region app can see egress dominate the bill.

---

## Compute optimisation

### Right-sizing

The single biggest waste: oversized instances.

```
Typical observation:
  Production CPU utilisation: 10-20% on average
  → Half the size would be sufficient
  → 50% cost reduction available
```

Tools:
- **AWS Compute Optimizer** — recommendations based on usage
- **Cloud-native monitoring** — Datadog Cost Estimator
- **Right-size workflows** — review monthly; adjust as workload changes

The pattern: provision for peak; idle most of the time. Use auto-scaling instead.

### Auto-scaling

```
Static fleet of 20 instances:
  - Sized for peak
  - Idle most of the day
  - Pays for unused capacity

Auto-scaling 5-20 instances:
  - Scales up at peak
  - Scales down off-peak
  - 30-60% cost reduction typical
```

Auto-scaling on:
- **CPU / memory utilisation** (classic)
- **Custom metrics** (queue depth, request rate)
- **Scheduled** (business hours scaling for predictable patterns)
- **Predictive** (AWS Predictive Scaling for known patterns)

### Spot / preemptible instances

Spare capacity at 60-90% discount. Trade-off: can be interrupted.

```
Spot is great for:
  ✓ Stateless workloads (web servers behind LB)
  ✓ Batch jobs (resumable)
  ✓ CI/CD runners
  ✓ Background workers (jobs queued, can be re-run)
  ✓ Big data (Spark on EMR)

Spot is bad for:
  ✗ Stateful services without replication
  ✗ Workloads with strict latency requirements during interruption
  ✗ Anything where 2-min interruption notice isn't enough
```

### Hybrid approach: on-demand baseline + spot scaling

```
2 on-demand instances (baseline; never interrupted)
Up to 20 spot instances (scale; cheap)

If spot interrupted: gracefully drain; on-demand absorbs traffic
If all spot gone: still 2 on-demand serving (degraded but up)
```

This is the **production pattern for cost-conscious teams**. AWS Spot Fleet, Karpenter (K8s), GCP Spot VMs all support this.

### Reserved instances / Savings Plans

Commit to usage in exchange for discount.

```
1-year commitment:  ~25-35% discount
3-year commitment:  ~40-60% discount

For predictable baseline workloads:
  Reserve the baseline
  On-demand or spot for variable load
```

AWS Savings Plans are more flexible than RIs (apply across instance families). Generally preferred.

The trap: **over-commitment**. If you commit to 100 instances and only need 60, the 40 unused are paid waste. Start with smaller commitments; grow as confidence grows.

### Serverless cost gotchas

Lambda is cheap until it isn't.

```
Workload:                      Lambda cost     ECS Fargate cost
1M req/month, 100ms each:      ~$3            ~$25
100M req/month, 100ms each:    ~$300          ~$200
1B req/month, 100ms each:      ~$3000         ~$1000

Crossover: around 10M-50M req/month for moderate compute time.
```

Past a certain scale, containers / EC2 are cheaper. Re-evaluate periodically.

---

## Database costs

### Right-sizing DBs

Same principle as compute. Most DBs are over-provisioned for "headroom."

```
Observe actual usage:
  CPU < 30%:           downsize
  IOPS << provisioned: lower disk tier
  Connections << max:  trim connection pool

Common saving: 30-50% on DB tier
```

### Tier appropriately

```
Production primary: high-tier, multi-AZ
Production replica: lower tier OK (or same; depends on read load)
Staging: smaller tier
Dev: smallest tier (or shared)
Testing: ephemeral (created/destroyed)
```

Companies often run dev on prod-sized instances. Easy 50%+ savings.

### Aurora I/O-optimised vs standard

AWS Aurora has two pricing models:

```
Standard:        compute + I/O charges (cheaper compute; pay per I/O)
I/O-optimised:   higher compute; unlimited I/O included

Break-even: high-I/O workloads benefit from I/O-optimised
            low-I/O: standard is cheaper
```

Re-evaluate periodically. AWS provides a calculator.

### DynamoDB on-demand vs provisioned

```
On-demand:          pay per request; no capacity planning
                    Best for: unpredictable, spiky, infrequent

Provisioned:        pay for capacity; cheaper at scale
                    Best for: steady, predictable, high-volume

Switch threshold:   typically ~3-4× steady state load justifies provisioned
                    
Reserved capacity:  on top of provisioned; 1y or 3y; 50-80% off
```

For high-volume DynamoDB: provisioned + reserved capacity is the cheapest combo.

### Archive cold data

```
Active table in DynamoDB: $$$
Older data, rarely accessed: should be in S3

Pattern: TTL on the live table → export to S3 → query via Athena when needed
```

Same for Postgres: archive old data to S3 instead of keeping in DB forever. Tools: pg_partman + retention policies.

---

## Storage costs

### S3 tiering

```
Standard:           $0.023/GB-month (hot)
Standard-IA:        $0.0125/GB-month (cold; minimum 30 days)
Glacier Instant:    $0.004/GB-month (rare; instant retrieval)
Glacier Flexible:   $0.0036/GB-month (hours retrieval)
Glacier Deep:       $0.00099/GB-month (12hr retrieval)

Intelligent-Tiering: AWS auto-tiers based on access; +$0.0025/1k objects
```

For unknown access patterns: use Intelligent-Tiering. For known: lifecycle policies.

```yaml
# S3 lifecycle rule
LifecycleConfiguration:
  Rules:
    - Status: Enabled
      Transitions:
        - StorageClass: STANDARD_IA
          Days: 30
        - StorageClass: GLACIER_IR
          Days: 90
        - StorageClass: GLACIER_DEEP_ARCHIVE
          Days: 365
      Expiration:
        Days: 2555  # 7 years
```

### EBS volume types

```
gp3:    default; cheap; tunable IOPS up to 16K  ← use this 90% of the time
io2:    high IOPS, more expensive; for databases needing >50K IOPS
st1:    throughput-optimised; big sequential workloads
sc1:    cold; cheapest; rarely accessed

Migration from gp2 to gp3: easy; typically 20% savings
```

### Snapshot cleanup

```
Each EBS snapshot: stored in S3; charged per GB
Forgotten snapshots from year-ago experiments: still paying for them

Tooling: automated snapshot lifecycle (AWS DLM)
        Or: periodic audit script
```

Common surprise: old AMIs, old snapshots, old EBS volumes — all unattached, all costing money. Audit quarterly.

---

## The egress battle

The most surprising line item on most bills.

### Egress pricing (AWS, 2026)

```
Within same AZ:           free
Between AZs (same region): $0.01/GB each way
Between regions:           $0.02/GB
To internet (outbound):    $0.05-0.09/GB (tiered; reduces at high volume)

Inbound (to AWS):          free
```

### Common egress waste

```
✗ Postgres in us-east-1a; app in us-east-1b → cross-AZ traffic per query
✗ Frontend in us-east-1; backend in us-west-2 → cross-region; expensive
✗ S3 bucket in us-east-1; reading from us-east-2 → cross-region
✗ Egress through NAT gateway when VPC endpoint would suffice
✗ Logs / metrics shipped to another region
✗ Cross-region replication of large data sets
```

### Mitigations

```
✓ Co-locate app + DB + cache (same AZ when possible)
✓ VPC endpoints for AWS services (S3, DynamoDB) — bypass NAT, no egress
✓ Use CloudFront for content delivery (CDN egress is cheaper)
✓ Compress responses (gzip / Brotli)
✓ Cache aggressively (fewer egress events)
✓ Multi-region only when justified
```

### Cloud-specific tricks

```
AWS:
  - VPC Endpoints (Gateway type free; Interface ~$0.01/hour + small data charges)
  - PrivateLink (services without internet egress)
  - CloudFront origin shield (reduces origin egress)

GCP:
  - Private Google Access (free internal access to GCP services)
  - Cloud CDN with Cache Fill

Azure:
  - Service Endpoints / Private Link
```

The biggest savings often come from **eliminating egress through NAT gateways**. NAT charges for everything that goes through it. VPC endpoints bypass NAT entirely.

---

## CDN economics

```
Origin server bandwidth: $0.05-0.09/GB egress
CDN bandwidth:           $0.02-0.085/GB (varies by region)
CDN hit ratio:           70-95% typical

Effect: most traffic served from cache; origin egress reduced 80%+
```

For traffic-heavy sites, **CloudFront / Cloudflare often more than pays for itself** in egress savings, before considering performance benefits.

### Cloudflare's pricing model is different

```
Cloudflare doesn't charge for bandwidth (in most tiers)
Charges based on requests, features, or flat fees

For high-egress sites: Cloudflare can be dramatically cheaper than CloudFront
For low-egress sites: CloudFront is competitive
```

Worth evaluating both for traffic-heavy services.

---

## Monitoring / observability costs

Surprising line item at scale.

```
Datadog at large scale:    can exceed $100K/month
Loki / OpenTelemetry stack: cheaper but operational overhead
Splunk:                     historically expensive; reducing
Custom Prometheus + Grafana: cheap infrastructure; operational cost

Tradeoff:
  Managed:  high $; low ops
  DIY:      low $; high ops
```

### Cost-controlling observability

```
✓ Log levels per environment (DEBUG in dev, INFO in prod, WARN+ for high-volume)
✓ Sample traces (1% sampling for high-volume services)
✓ Metric cardinality limits (don't tag with user_id; explodes cardinality)
✓ Retention policies (logs: 30-90d; metrics: 13-15 months)
✓ Archive to S3 (cheaper than vendor retention)
✓ Drop noisy logs at ingestion (filter, don't ship and drop later)
```

The single biggest mistake: **high-cardinality metric tags**. One `user_id` tag turns a metric into millions of series.

---

## Reducing waste — common patterns

### Idle / forgotten resources

```
Dev environments left running overnight
Failed deploy left orphaned resources
Old test environments
Forgotten experiments

Solution:
  - Auto-shutdown for non-prod (lambda + cron)
  - "Created by" tagging; auto-expire after N days
  - Periodic audit reports per team
```

### Over-provisioned databases

```
db.r6g.4xlarge for 5% CPU utilisation: clear over-spec
Resize to db.r6g.xlarge: ~75% cost reduction
```

### Dev/staging at prod scale

```
Prod fleet: 50 instances (justified)
Staging fleet: 50 instances (matching prod "for accuracy")

Reality: staging needs 2-5 instances. 90% savings.
```

### Unused load balancers

```
NLBs / ALBs: $20-40/month each, even idle
Forgotten ones add up
```

### Snapshots and AMIs

```
Auto-snapshots accumulate
Old AMIs forgotten
Cleanup: usually finds 10-30% savings on storage
```

### NAT gateway as accidental cost driver

```
$0.045/hour + $0.045/GB processed
At even moderate egress: hundreds of dollars/month per NAT

VPC endpoints replace many uses; PrivateLink for others
```

---

## Multi-region cost trap

Multi-region architectures are **2-3× the single-region cost** when done casually.

```
2-region active-active:
  2× compute
  2× database (typically)
  2× monitoring
  + cross-region replication bandwidth (significant)
  + cross-region operations overhead
  + multi-region observability stack
  
Total: typically 2-2.5× of single region
```

If multi-region isn't justified by latency / DR / compliance, **single-region is dramatically cheaper**.

See [Multi-Region Architecture](multi-region.md).

---

## Periodic review process

```
Monthly:
  Cost dashboard review
  Anomaly investigation
  Top growth lines explained

Quarterly:
  Right-sizing exercise
  Reserved capacity / Savings Plan analysis
  Tag compliance audit

Annually:
  Architecture cost review (per major system)
  Vendor renewal negotiations
```

Without recurring reviews, costs drift upward unchecked. The single best ROI: a senior engineer spending 4 hours/month on cost.

---

## Cost as an engineering KPI

Treat cost like latency or availability — a metric engineers own.

```
Service SLO: includes cost-per-request budget
Team OKR:    "Reduce cost-per-active-user by 15%"
PR review:   "How does this affect cost?" asked routinely
```

This works only if engineering has visibility (Inform phase). Without that, "reduce cost" is hand-wavy.

---

## When cost optimisation isn't worth it

Don't optimise costs when:

```
✗ The business is in product-market-fit mode (velocity matters more)
✗ The savings are smaller than the engineering time
✗ The optimisation increases risk (e.g., spot for stateful primary DB)
✗ Cost is rational for the value (e.g., paying Datadog for great UX)
```

Bad: spending 2 engineer-weeks to save $500/month.
Good: spending 2 engineer-weeks to save $50K/month.

Cost optimisation has its own ROI calculation.

---

## Vendor negotiation

Cloud providers negotiate. Especially for spending over ~$100K/month.

```
Levers:
  - Enterprise Discount Programs (EDP) — committed spend → discount tiers
  - Marketplace deals (move some spend through marketplace; same effect)
  - Migration credits (especially when threatening to leave)
  - Specific services discounts (e.g., DynamoDB at scale)

Not negotiable (typically):
  - List prices for individual resources
  - Egress (despite engineering demand)
```

Hire someone or work with cloud financial advisors for $1M+/year spends. The discounts can be substantial.

---

## Architectural patterns that save money

### 1. Stateless compute, stateful storage

```
Stateless compute: easy to scale; spot/preemptible viable; rightsizable
Stateful storage: thoughtful; managed services; appropriate tier

Most cost savings live in compute. Storage is harder to reduce.
```

### 2. Async over sync

```
Long-running sync requests: tie up compute
Async: queue + workers; can scale to 0 between bursts

Background processing on spot/preemptible: very cheap
```

### 3. CDN-first architecture

```
Heavy egress origins: expensive
CDN with 90%+ hit rate: 10× cheaper egress
Static-first design: more cacheable; cheaper
```

### 4. Tiered storage

```
Hot data: fast storage (expensive per GB)
Warm data: cheaper tier
Cold data: archival
Auto-lifecycle: never think about it
```

### 5. Serverless for variable / spiky

```
Predictable steady load: containers/EC2 cheaper
Spiky / unpredictable / event-driven: serverless cheaper
Mix appropriately
```

### 6. Single-region where possible

```
Multi-region only when justified by latency/DR/compliance
Otherwise single-region + good backups
```

---

## Tools

```
Built-in:
  AWS Cost Explorer, Cost Anomaly Detection, Budgets
  GCP Cloud Billing, Recommendations
  Azure Cost Management

3rd party:
  CloudHealth (VMware), CloudCheckr, Apptio
  Vantage, CloudZero, Finout (newer)
  Datadog Cost Management, Kubecost (K8s)

DIY:
  CUR (Cost & Usage Report) → S3 → Athena → custom dashboards
  Particularly useful for tag-based attribution
```

For larger orgs: dedicated FinOps tooling pays for itself. For smaller: built-in tools + monthly engineer review.

---

## Anti-patterns

| Anti-pattern | Better |
|---|---|
| Provision for theoretical peak (3× actual) | Auto-scaling; spot for buffer |
| Same instance class for dev as prod | Dev sized for dev needs |
| Snapshot everything; never delete | Lifecycle automation |
| Multi-region "for safety" | Justified by specific need |
| Datadog with all logs | Sample; tier; archive |
| All static assets through origin | CDN with high hit rate |
| NAT gateway for AWS API calls | VPC endpoints |
| Reserved capacity by max possible usage | Reserve baseline; on-demand for spikes |
| Never review costs | Monthly minimum review |
| "AWS is expensive" as conclusion | Specific optimisations, measured |

---

## Quick reference

```
"AWS bill doubled, no idea why"          Cost Explorer + tag breakdown; check egress + new services
"Reduce costs by 30%"                    Right-sizing + spot/RI + cleanup unused
"Multi-region is expensive"              Yes; justify it or simplify to single region
"DynamoDB cost spiked"                   Provisioned + reserved; or query pattern issue
"Datadog cost out of control"            Cardinality + sampling + retention
"Egress is half our bill"                VPC endpoints + CDN + region consolidation
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you think about cost as architecture, not just "make it cheaper."

**Strong answer pattern:**
1. Tag everything; measure unit economics (cost per user / request)
2. Compute biggest line item; right-size + auto-scale + spot
3. Egress is the sneaky #2; co-locate; VPC endpoints; CDN
4. Reserved capacity for baseline; on-demand or spot for variable
5. Multi-region is 2-3× cost; only when justified
6. Cost monthly review process; treat as engineering metric

**Common follow-up:** *"Your AWS bill grew 40% YoY but traffic only grew 10%. Where would you look?"*
> Per-unit cost trend tells the story. If cost-per-request grew, something structural changed. Likely candidates: (1) a new high-cost service added (analytics, ML, observability), (2) data volume grew faster than traffic and storage costs are accumulating, (3) cross-region traffic increased disproportionately (a recent multi-region expansion?), (4) developer environments proliferated (more teams, more sandboxes). Pull the bill by tag + month-over-month delta. The dominant growth line will show up. Then investigate that specifically. Often it's one or two services — not death by 1000 cuts.

---

## Related

- [Capacity Planning](capacity-planning.md) — sizing for actual need
- [Multi-Region Architecture](multi-region.md) — the cost trap
- [Edge Architecture](edge-architecture.md) — CDN economics
- [Quality Attributes](quality-attributes.md) — cost as one dimension
- [Architecture Politics](architecture-politics.md) — getting cost prioritised
- FinOps Foundation: https://www.finops.org/
