---
tags:
  - applied
---

# Symptom → Concept Lookup

Spot a problem at work, find the right concept fast. This page is **diagnostic-first**: each row is a real-world symptom you'd actually say out loud, mapped to the page that explains the underlying concept and what to do about it.

Use Cmd+F / Ctrl+F to search by symptom keyword.

---

## Reliability and outages

| If you see this... | Likely concept | What to read |
|---|---|---|
| One slow downstream service is taking down our whole stack | Cascade failure → Circuit Breaker | [Circuit Breaker](../patterns/circuit-breaker.md) |
| 200 threads stuck waiting on a 30-second timeout | Missing timeouts / no bulkhead | [Retry & Timeout](../patterns/retry-timeout.md), [Bulkhead](../patterns/bulkhead.md) |
| Service A goes down → Service B goes down → Service C goes down | Cascading failure across services | [Circuit Breaker](../patterns/circuit-breaker.md), [Bulkhead](../patterns/bulkhead.md) |
| Service is "healthy" per monitoring but users see errors | Gray failure | [Failure Modes](../fundamentals/failure-modes.md) |
| Brief outage → 1M clients all retry simultaneously → outage stays | Thundering herd | [Backoff Strategies](../patterns/backoff.md) |
| Retries are making things worse, not better | Need exponential backoff with jitter | [Backoff Strategies](../patterns/backoff.md), [Retry & Timeout](../patterns/retry-timeout.md) |
| One service's failure cascades to many | No bulkhead isolation | [Bulkhead](../patterns/bulkhead.md) |
| "We had an outage and only one team could deploy" | Distributed monolith | [Anti-Patterns](../architecture/anti-patterns.md) |
| Outage when one shared component fails (auth, DNS) | Single point of failure | [Availability & Reliability](../fundamentals/availability.md), [Failure Modes](../fundamentals/failure-modes.md) |
| Pages stop responding at exactly 3 AM nightly | Likely cron job spike or DB maintenance window | [Failure Modes](../fundamentals/failure-modes.md), [Hot Partitions](../fundamentals/hot-partitions.md) |
| Outage post-mortem says "load balancer health check passing but pods broken" | Health check too shallow | [Failure Modes](../fundamentals/failure-modes.md) |

---

## Performance

| If you see this... | Likely concept | What to read |
|---|---|---|
| Reads are fast but writes lag behind | LSM trade-offs, or write-heavy workload on B-tree DB | [Storage Engine Internals](../fundamentals/storage-internals.md) |
| Queries that touched 100 rows now touch 10M | Missing index, full table scan | [Database Indexes](../fundamentals/database-indexes.md) |
| Adding more servers doesn't add proportional throughput | Hitting Amdahl's / USL ceiling | [Throughput Limits](../fundamentals/throughput-limits.md) |
| One shard at 90% CPU, others at 5% | Hot partition / hot key | [Hot Partitions & Hotspots](../fundamentals/hot-partitions.md) |
| One key in Redis serves 50% of traffic | Hot key | [Hot Partitions](../fundamentals/hot-partitions.md), [Caching Patterns](../caching/cache-patterns.md) |
| Latency P99 is 10× P50 | Tail latency, fan-out amplification | [Latency vs Throughput](../fundamentals/latency-throughput.md), [Throughput Limits](../fundamentals/throughput-limits.md) |
| Database CPU pegged but queries look simple | N+1, missing index, or vacuum needed | [Database Indexes](../fundamentals/database-indexes.md) |
| Cold start of a new instance is unbearably slow | Missing warm-up, JIT, or page cache | [OS Concepts](../fundamentals/os-concepts.md), [Memory Hierarchy](../fundamentals/memory-hierarchy.md) |
| Throughput plateaus far below network bandwidth | TCP window / BDP problem | [TCP/UDP Deep Dive](../fundamentals/tcp-udp-deep-dive.md) |
| First HTTP request slow, rest fast | TCP handshake + TLS not pooled | [TCP Deep Dive](../fundamentals/tcp-udp-deep-dive.md), [TLS](../fundamentals/tls-certificates.md) |
| Request fans out to 50 services; P99 is awful | Fan-out tail latency | [Latency vs Throughput](../fundamentals/latency-throughput.md) |
| Reading code is fine but writing it scrolls forever in editor | Cache lines / file size — different problem |  |

---

## Data correctness and concurrency

| If you see this... | Likely concept | What to read |
|---|---|---|
| Two operations both ran; we expected only one | Need idempotency, dedup keys | [Idempotency](../patterns/idempotency.md) |
| Webhooks delivered twice; processing applied twice | Idempotency keys missing | [Idempotency](../patterns/idempotency.md) |
| Counter race condition: two increments → only one stuck | Lost update | [Database Transactions & Isolation](../fundamentals/isolation-levels.md), [Concurrency](../fundamentals/concurrency.md) |
| Negative balances appearing under load | Read-then-write race | [Isolation Levels](../fundamentals/isolation-levels.md) |
| Constraint violated (e.g., double-booked) under load | Write skew at Snapshot Isolation | [Isolation Levels](../fundamentals/isolation-levels.md) |
| Different users see different values for "the same" data | Eventual consistency in action | [Consistency Models](../fundamentals/consistency-models.md), [CAP Theorem](../fundamentals/cap-theorem.md) |
| User updates profile, refreshes page, old value back | Read-after-write inconsistency | [Consistency Models](../fundamentals/consistency-models.md) |
| Database replication lag = 10s during traffic spike | Read replica lag | [Replication](../patterns/replication.md), [Read Replicas](../patterns/read-replicas.md) |
| "We need exactly-once message delivery" | Spoiler: usually you need idempotency, not actual exactly-once | [Idempotency](../patterns/idempotency.md), [Exactly-Once Semantics](../distributed/exactly-once.md) |
| Distributed transaction across services is painful | Saga pattern is usually the answer | [Saga Pattern](../patterns/saga-pattern.md) |
| Order placed but payment never charged (or vice versa) | Multi-step transaction without saga | [Saga Pattern](../patterns/saga-pattern.md), [Outbox Pattern](../patterns/outbox.md) |
| Database write succeeded but message wasn't published | Dual-write problem | [Outbox Pattern](../patterns/outbox.md) |
| Different replicas of same record disagree | Eventual consistency, conflict resolution | [CRDTs](../distributed/crdts.md), [Quorum](../distributed/quorum.md) |
| "Schema change broke 5 services" | Service coupling at the data layer | [Coupling & Cohesion at Service Boundaries](../architecture/coupling-cohesion-services.md) |

---

## Scale and capacity

| If you see this... | Likely concept | What to read |
|---|---|---|
| Adding more web servers doesn't help; database is the bottleneck | Read scaling needed | [Read Replicas](../patterns/read-replicas.md), [Caching Strategies](../caching/caching-strategies.md) |
| Single Postgres at 80% capacity, growing | Need to shard, replicate, or both | [Sharding](../patterns/sharding.md), [Read Replicas](../patterns/read-replicas.md) |
| One table is 90% of database size | Should be sharded or moved to specialised store | [Sharding](../patterns/sharding.md), [Time-Series DBs](../storage/time-series-databases.md) |
| Connection limit reached on database under load | Connection pool exhaustion | [Connection Pooling](../patterns/connection-pooling.md) |
| Adding a new node to a cluster moves nearly all keys | Naive `hash mod N` partitioning | [Consistent Hashing](../patterns/consistent-hashing.md) |
| Need to add capacity without downtime | Consistent hashing + virtual nodes | [Consistent Hashing](../patterns/consistent-hashing.md), [Sharding](../patterns/sharding.md) |
| Multi-tenant SaaS, one giant tenant slows everyone | Noisy neighbour | [Multi-Tenancy](../architecture/multi-tenancy.md), [Hot Partitions](../fundamentals/hot-partitions.md) |
| Black Friday traffic 10× normal for 4 hours | Auto-scaling won't be fast enough; pre-warm | [Capacity Planning](../architecture/capacity-planning.md) |
| Service is fast under load test but breaks in production | Real traffic patterns differ; queuing theory | [Queuing Theory](../fundamentals/queuing-theory.md) |
| 90% CPU feels like the system is broken | Queuing theory: above 70% utilisation, latency spikes | [Queuing Theory](../fundamentals/queuing-theory.md) |

---

## Caching

| If you see this... | Likely concept | What to read |
|---|---|---|
| Cache miss storm after deploy / restart | Cold cache, warm-up needed | [Caching Strategies](../caching/caching-strategies.md), [Cache Patterns](../caching/cache-patterns.md) |
| Cache stampede: 1000 requests rebuild same cache entry | Lock or single-flight needed | [Cache Patterns & Pitfalls](../caching/cache-patterns.md) |
| Stale data shown after writes | Cache invalidation strategy | [Cache Invalidation](../caching/cache-invalidation.md) |
| Cache hit rate is 30%, was 90% last week | Working set grew or eviction policy wrong | [Eviction Policies](../caching/eviction-policies.md) |
| Need cache to be consistent across N app servers | Distributed cache | [Distributed Caching](../caching/distributed-caching.md) |
| 1M servers all read same Redis key constantly | Hot key in cache | [Hot Partitions](../fundamentals/hot-partitions.md), [Cache Patterns](../caching/cache-patterns.md) |

---

## Architecture and team

| If you see this... | Likely concept | What to read |
|---|---|---|
| 5-person team running 30 microservices, drowning in ops | Premature microservices | [Anti-Patterns](../architecture/anti-patterns.md), [Modular Monolith](../architecture/modular-monolith.md) |
| Every PR touches multiple services | Distributed monolith | [Anti-Patterns](../architecture/anti-patterns.md), [Coupling at Service Boundaries](../architecture/coupling-cohesion-services.md) |
| Services share a database / read each other's tables | Service coupling at data layer | [Coupling at Service Boundaries](../architecture/coupling-cohesion-services.md) |
| Onboarding a new engineer takes 6 months | Big ball of mud / no boundaries | [Anti-Patterns](../architecture/anti-patterns.md) |
| Hard to know what changes when "core service" is touched | God service | [Anti-Patterns](../architecture/anti-patterns.md) |
| 50 engineers, one codebase, deploys are scary | Need modular boundaries or split | [Modular Monolith](../architecture/modular-monolith.md), [Microservices Patterns](../architecture/microservices-patterns.md) |
| Migrating from monolith to microservices, frozen for months | Big-bang rewrite (don't) | [Strangler Fig](../architecture/strangler-fig.md) |
| Domain logic mixed with database / framework code | Tight coupling, no hexagonal | [Hexagonal Architecture](../architecture/hexagonal.md) |
| "It works on my machine" — env config drift | Twelve-factor violation | [Twelve-Factor App](../architecture/twelve-factor.md) |
| Mobile app and web app need different API shapes | Backend for Frontend | [BFF](../architecture/bff.md) |
| Need audit trail for every state change | Event sourcing fits | [Event Sourcing](../patterns/event-sourcing.md), [CQRS+ES](../architecture/cqrs-event-sourcing-architecture.md) |
| Read load 100× write load, single model serving both | CQRS opportunity | [CQRS](../patterns/cqrs.md) |
| Need to rebuild a "view" of data with new fields | Event sourcing replay | [Event Sourcing](../patterns/event-sourcing.md) |
| 12 services in a workflow, all subscribing to events, lost track of flow | Need orchestration, not choreography | [Choreography vs Orchestration](../architecture/choreography-vs-orchestration.md) |
| Long-running workflow (waits, human approval, retries across days) | Workflow engine fits (Temporal, Step Functions) | [Choreography vs Orchestration](../architecture/choreography-vs-orchestration.md) |
| Users in EU complain of slow load times | Multi-region or edge | [Multi-Region](../architecture/multi-region.md), [Edge Architecture](../architecture/edge-architecture.md) |
| Need GDPR data residency | Per-tenant region | [Multi-Region](../architecture/multi-region.md), [Multi-Tenancy](../architecture/multi-tenancy.md) |

---

## Database choice

| If you see this... | Likely concept | What to read |
|---|---|---|
| Querying with complex joins across many tables | Relational database | [Relational Databases](../storage/relational-databases.md) |
| Simple lookups by ID, ultra-low latency | Key-value store | [Key-Value Stores](../storage/key-value-stores.md), [SQL vs NoSQL](../storage/sql-vs-nosql.md) |
| Document with nested arbitrary fields, no fixed schema | Document store | [Document Stores](../storage/document-stores.md) |
| Append-only events with timestamp queries | Time-series database | [Time-Series Databases](../storage/time-series-databases.md) |
| Full-text search, ranking, fuzzy matching | Search engine | [Search Engines](../storage/search-engines.md) |
| Wide rows, billions of records, write-heavy | Wide-column store (Cassandra, ScyllaDB) | [Wide-Column Stores](../storage/wide-column-stores.md) |
| Vector similarity search for AI / embeddings | Vector database | [Vector Databases](../storage/vector-databases.md) |
| Highly connected data (social graph, recommendations) | Graph database | [Graph Databases](../storage/graph-databases.md) |
| Need analytics on petabytes | Data warehouse, columnar | [Data Warehousing](../storage/data-warehousing.md) |
| "We picked NoSQL because it's faster" — and it isn't | Wrong tool for the job | [SQL vs NoSQL](../storage/sql-vs-nosql.md) |
| Need ACID at scale, multi-region | NewSQL (Spanner, CockroachDB) | [NewSQL](../storage/newsql.md) |

---

## Networking and APIs

| If you see this... | Likely concept | What to read |
|---|---|---|
| Need streaming bidirectional connection (chat, live updates) | WebSockets or SSE | [WebSockets & SSE](../networking/websockets-sse.md) |
| Need very low latency RPC between services | gRPC | [gRPC](../api/grpc.md) |
| Frontend wants to specify exactly which fields to fetch | GraphQL | [GraphQL](../api/graphql.md) |
| External integration that pushes events to us | Webhooks | [Webhooks](../api/webhooks.md) |
| API change broke 50 customers | Breaking change without versioning | [API Versioning](../api/versioning.md), [API Versioning at Architecture Level](../architecture/api-versioning-architecture.md) |
| Need to abuse-proof an endpoint | Rate limiting | [Rate Limiting](../patterns/rate-limiting.md) |
| User makes 1000 requests/sec | Token bucket / leaky bucket | [Rate Limiting](../patterns/rate-limiting.md) |
| TLS handshake taking 200+ms | TLS 1.2 → upgrade to 1.3 or use 0-RTT resumption | [TLS and Certificates](../fundamentals/tls-certificates.md) |
| Mobile users on flaky networks see lots of failures | TCP head-of-line blocking; consider QUIC/HTTP/3 | [TCP/UDP Deep Dive](../fundamentals/tcp-udp-deep-dive.md), [HTTP Versions](../networking/http-versions.md) |

---

## Messaging

| If you see this... | Likely concept | What to read |
|---|---|---|
| Producer outpacing consumer; queue depth growing | Backpressure or scale consumer | [Backpressure](../messaging/backpressure.md) |
| Want fan-out to many subscribers | Pub/sub | [Pub/Sub](../messaging/pub-sub.md) |
| Want replay-able event log | Kafka | [Event Streaming](../messaging/event-streaming.md), [Kafka](../messaging/kafka.md) |
| Need exactly-once message processing | Probably need idempotent consumers | [Idempotency](../patterns/idempotency.md), [Exactly-Once](../distributed/exactly-once.md) |
| Order matters in messages | Single partition / consumer | [Event Streaming](../messaging/event-streaming.md), [Kafka](../messaging/kafka.md) |
| Lost messages when broker restarts | Need acknowledgement / persistence config | [Message Queues](../messaging/message-queues.md), [Kafka](../messaging/kafka.md) |

---

## Security

| If you see this... | Likely concept | What to read |
|---|---|---|
| Need user login | OAuth 2.0 / OIDC | [OAuth 2.0 & JWT](../security/oauth-jwt.md) |
| API needs auth between services | mTLS or signed JWTs | [TLS](../fundamentals/tls-certificates.md), [Zero Trust](../security/zero-trust.md) |
| Secrets in environment variables / config files | Secrets manager needed | [Secrets Management](../security/secrets-management.md) |
| Public S3 bucket / open security group found in audit | IaC scanning needed | [Secrets in IaC](../iac/secrets-in-iac.md), [Testing IaC](../iac/testing-iac.md) |
| Network breach in one service spread laterally | No zero trust / no segmentation | [Zero Trust](../security/zero-trust.md) |
| API hammered with bot requests | Rate limiting + bot detection at edge | [Rate Limiting](../patterns/rate-limiting.md), [Edge Architecture](../architecture/edge-architecture.md) |
| Compliance audit: "show every action by every user" | Event sourcing or audit log | [Event Sourcing](../patterns/event-sourcing.md) |

---

## Operations and delivery

| If you see this... | Likely concept | What to read |
|---|---|---|
| Production looks different from staging | Twelve-factor / config drift | [Twelve-Factor App](../architecture/twelve-factor.md), [IaC](../iac/index.md) |
| Manual changes in cloud console; nobody knows what's deployed | Need IaC | [IaC Fundamentals](../iac/fundamentals.md) |
| "Cluster state doesn't match Git" | Drift | [Drift Detection](../iac/drift-detection.md) |
| Deploys are slow / scary | No automation, big-bang releases | [CI/CD Fundamentals](../cicd/fundamentals.md), [Deployment Strategies](../cicd/deployment-strategies.md) |
| Bug in production, can't roll back without deploy | Need feature flags | [Branching Strategies](../cicd/branching-strategies.md), [Release Management](../cicd/release-management.md) |
| 1% of users hit a new bug right after deploy | Canary deploy + automated rollback | [Deployment Strategies](../cicd/deployment-strategies.md), [Progressive Delivery](../cicd/progressive-delivery.md) |
| Deploys take 30 minutes / require coordination | Distributed monolith / coupling | [Coupling at Service Boundaries](../architecture/coupling-cohesion-services.md), [Anti-Patterns](../architecture/anti-patterns.md) |
| Outage took 2 hours to diagnose | Observability gap | [Observability](../observability/index.md), [Distributed Tracing](../observability/tracing.md) |
| Pages firing all night, can't tell what's actually broken | Alerting too noisy / too coarse | [Alerting](../observability/alerting.md), [SLO](../observability/slo-sla.md) |
| "We met 99.9% uptime" — but customers complain | SLO doesn't match user experience | [SLI, SLO & SLA](../observability/slo-sla.md) |

---

## Cost

| If you see this... | Likely concept | What to read |
|---|---|---|
| AWS bill doubled month-over-month, can't find why | No cost tagging, no budget alerts | [Capacity Planning](../architecture/capacity-planning.md) |
| Idle servers running 24/7 | Auto-scaling / serverless | [Serverless](../architecture/serverless.md), [Capacity Planning](../architecture/capacity-planning.md) |
| Egress charges from cloud surprised us | Cross-region / cross-AZ traffic | [Multi-Region](../architecture/multi-region.md), [Capacity Planning](../architecture/capacity-planning.md) |
| Database scaling cost > application scaling cost | Probably need caching layer | [Caching Strategies](../caching/caching-strategies.md) |
| Multi-region setup costs 3× our budget | Don't go multi-region without justification | [Multi-Region](../architecture/multi-region.md) |

---

## How to use this page

1. **You hit a problem at work.** You don't know what it's called.
2. **Cmd+F the symptom.** Search by the words you'd actually use ("slow", "stuck", "race", "lag", "sharding", "double-charged").
3. **Click through to the concept page.** Read the "What it is" + "When to use it" sections — that's enough to act on.
4. **Implementation later.** The concept page has code, config examples, library links if you decide to apply.

This page is intentionally **incomplete by design**. It's the symptoms most engineers run into; not every page is here. If you can't find your symptom, browse by topic in the left sidebar.

---

## Related shortcuts

- [Glossary](../glossary.md) — one-line definitions of every concept
- [Interview Guide](../interview-guide.md) — same concepts framed for interviews
- [Architecture Anti-Patterns](../architecture/anti-patterns.md) — recognise architectural smells
- [Failure Modes Catalogue](../fundamentals/failure-modes.md) — taxonomy of how systems break
