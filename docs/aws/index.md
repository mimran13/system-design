# AWS Mapping

<div class="sec-hero" markdown>
<span class="ey">Cloud · service mapping</span>
AWS offers hundreds of services. This section maps system design concepts to concrete AWS services — useful for both real architecture decisions and the Solutions Architect exam. Each page answers: which service fits which problem, what the key configuration decisions are, and what gotchas come up in practice.
</div>

---

## Concept → AWS service map

```
Compute
  Virtual machines          → EC2
  Containers (managed)      → ECS (Fargate) / EKS
  Serverless functions      → Lambda
  Batch processing          → AWS Batch

Storage & Databases
  Relational DB (OLTP)      → RDS (PostgreSQL, MySQL, Aurora)
  Key-value / document      → DynamoDB
  In-memory cache           → ElastiCache (Redis / Memcached)
  Object / blob storage     → S3
  Data warehouse (OLAP)     → Redshift
  Graph database            → Neptune
  Time-series               → Timestream
  Search                    → OpenSearch (Elasticsearch)

Networking
  DNS + routing             → Route 53
  CDN                       → CloudFront
  Load balancing            → ALB (L7) / NLB (L4)
  API gateway               → API Gateway
  Private networking        → VPC, subnets, security groups

Messaging
  Task queue                → SQS
  Pub/Sub fan-out           → SNS
  Event routing             → EventBridge
  Event streaming           → Kinesis Data Streams / MSK (Kafka)

Observability
  Metrics + alarms          → CloudWatch
  Distributed tracing       → X-Ray
  Centralized logging       → CloudWatch Logs / OpenSearch

Security
  Identity & access         → IAM
  Secrets management        → Secrets Manager / Parameter Store
  Encryption key management → KMS
  Web application firewall  → WAF
  DDoS protection           → Shield
  Certificate management    → ACM (Certificate Manager)
```

---

## Topics in this section

<div class="pcards">
<a class="pcard" href="compute/"><span class="t">Compute</span><span class="d">EC2, ECS, Lambda, EKS — when to use each, instance types, scaling</span></a>
<a class="pcard" href="storage-databases/"><span class="t">Storage & Databases</span><span class="d">S3, RDS, Aurora, DynamoDB, ElastiCache, Redshift — selection guide</span></a>
<a class="pcard" href="networking/"><span class="t">Networking</span><span class="d">VPC design, Route 53, CloudFront, ALB/NLB, PrivateLink</span></a>
<a class="pcard" href="messaging/"><span class="t">Messaging</span><span class="d">SQS, SNS, EventBridge, Kinesis, MSK — async patterns on AWS</span></a>
<a class="pcard" href="observability/"><span class="t">Observability</span><span class="d">CloudWatch, X-Ray, OpenTelemetry on AWS — what to instrument</span></a>
<a class="pcard" href="security/"><span class="t">Security</span><span class="d">IAM, KMS, Secrets Manager, WAF, Shield — defense in depth on AWS</span></a>
</div>

---

## Key decision heuristics

**Compute:**
```
Need full OS control?         → EC2
Running containers?           → ECS/Fargate (managed) or EKS (Kubernetes)
Event-driven, short-lived?    → Lambda (≤15 min, no persistent state)
Long-running batch jobs?      → AWS Batch or ECS on EC2
```

**Database:**
```
Relational + ACID?            → RDS PostgreSQL / Aurora
Need global scale + NoSQL?    → DynamoDB (single-digit ms, unlimited scale)
Cache/session store?          → ElastiCache Redis
Analytical queries?           → Redshift (columnar, petabyte-scale)
Graph relationships?          → Neptune
Vector similarity search?     → OpenSearch with k-NN / RDS pgvector
```

**Messaging:**
```
Task queue (point-to-point)?  → SQS
Fan-out to many consumers?    → SNS → SQS fan-out
Event routing + filtering?    → EventBridge
High-throughput streaming?    → Kinesis (managed) or MSK (self-managed Kafka)
```

---

## Common architecture patterns on AWS

```
Web application (3-tier):
  Route 53 → CloudFront → ALB → ECS/EC2 → RDS + ElastiCache

Serverless API:
  Route 53 → API Gateway → Lambda → DynamoDB

Event-driven microservices:
  Service A → SQS → Service B (worker)
  State change → EventBridge → multiple downstream services

Data pipeline:
  Kinesis Data Streams → Lambda/Firehose → S3 → Glue → Redshift
```

---

## Related topics

- [Storage](../storage/index.md) — database type selection before picking AWS service
- [Networking](../networking/index.md) — networking concepts that map to Route 53, CloudFront, ALB
- [Messaging](../messaging/index.md) — queue/stream concepts before mapping to SQS/Kinesis
- [Observability](../observability/index.md) — what to measure before choosing CloudWatch/X-Ray
- [Security](../security/index.md) — security model before mapping to IAM/KMS/WAF
