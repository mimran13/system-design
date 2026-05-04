# Glossary

One-liner definitions for every concept in this encyclopedia. Use **Ctrl+F** / **⌘+F** to search, or jump by letter.

[A](#a) · [B](#b) · [C](#c) · [D](#d) · [E](#e) · [F](#f) · [G](#g) · [H](#h) · [I](#i) · [J](#j) · [K](#k) · [L](#l) · [M](#m) · [N](#n) · [O](#o) · [P](#p) · [Q](#q) · [R](#r) · [S](#s) · [T](#t) · [V](#v) · [W](#w) · [Z](#z)

---

## A

**Agent (AI)** — System where an LLM drives a reasoning loop: it decides what actions to take, calls tools, observes results, and iterates until a goal is reached. `AI Engineering`

**ANN (Approximate Nearest Neighbour)** — Search algorithm that finds near-exact nearest neighbours in high-dimensional vector space orders of magnitude faster than exact search. `AI Engineering`

**ACID** — Four transaction guarantees (Atomicity, Consistency, Isolation, Durability) that ensure database writes are reliable even under failures. `Fundamentals`

**Alerting** — Rules that fire notifications when a metric crosses a threshold, turning telemetry into actionable signals. `Observability`

**API Gateway** — Single entry point that routes, authenticates, rate-limits, and transforms API traffic before it reaches backend services. `Networking`

**API Security** — Defenses applied at the API layer: input validation, authentication, rate limiting, and transport encryption. `Security`

**API Versioning** — Strategy for evolving an API (URI path, headers, or query params) without breaking existing clients. `API`

**ARC (Adaptive Replacement Cache)** — Self-tuning eviction policy that automatically balances between recency (LRU) and frequency (LFU) based on observed access patterns. `Caching`

**Authentication (AuthN)** — Verifying the identity of a user or service — confirming *who* is making a request. `Security`

**Authorization (AuthZ)** — Deciding what an authenticated principal is allowed to do — enforcing *what* they can access. `Security`

**Availability** — The fraction of time a system is operational and serving requests, expressed as a percentage (e.g. 99.9%). `Fundamentals`

---

## B

**Back-of-Envelope Estimation** — Quick order-of-magnitude calculation of QPS, storage, and bandwidth to check if a design is feasible before detailing it. `Fundamentals`

**Backend for Frontend (BFF)** — Dedicated API layer per client type (web, mobile) so each gets a response shaped exactly to its needs, not a one-size-fits-all API. `Architecture`

**Backoff Strategies** — Waiting progressively longer between retries (linear, exponential, with jitter) to avoid overwhelming a recovering downstream service. `Patterns`

**Backpressure** — Mechanism for a consumer to signal overload to its upstream producers, slowing ingestion to match processing capacity. `Messaging`

**BASE** — Distributed consistency model: Basically Available, Soft state, Eventually consistent — trades strong consistency for availability and partition tolerance. `Fundamentals`

**Blob Storage** — Object store for unstructured binary data (images, video, backups) identified by a key, not a file path or table row. `Storage`

**Bloom Filter** — Space-efficient probabilistic set membership structure with no false negatives — if it says "not in set", the item is definitely absent. `Caching`

**Bulkhead** — Isolating components into separate resource pools so that a failure or overload in one does not cascade to others. `Patterns`

---

## C

**Chain-of-Thought (CoT)** — Prompting technique that asks the model to reason step-by-step before answering, dramatically improving accuracy on multi-step problems. `AI Engineering`

**Chunking** — Splitting documents into smaller segments for indexing in a RAG pipeline; chunk size and overlap are the most impactful RAG tuning parameters. `AI Engineering`

**Context Window** — Maximum number of tokens an LLM can process at once (both input and output); larger windows cost more and degrade attention quality at extremes. `AI Engineering`

**Continuous Batching** — LLM serving optimisation that adds new requests to the batch as sequences complete, keeping the GPU fully utilised. `AI Engineering`

**CAP Theorem** — A distributed data store can guarantee at most 2 of 3 properties simultaneously: Consistency, Availability, and Partition tolerance. `Fundamentals`

**Cache Avalanche** — Many cache keys expire simultaneously, causing a sudden mass of DB queries that overloads the database. `Caching`

**Cache Invalidation** — Ensuring cached data reflects the latest state of the source of truth — widely considered the hardest problem in caching. `Caching`

**Cache Penetration** — Repeated queries for keys that don't exist in cache or DB, preventing any caching and hammering the database. `Caching`

**Cache Stampede (Thundering Herd)** — A hot cache key expires and all concurrent requests simultaneously miss and race to rebuild it from the DB. `Caching`

**Cache-Aside (Lazy Loading)** — The application checks the cache first; on a miss, fetches from the DB and populates the cache itself. `Caching`

**CDN (Content Delivery Network)** — Globally distributed network of edge nodes that cache and serve content close to users, reducing origin load and latency. `Networking`

**CI/CD** — Automated pipeline that builds, tests, and deploys code changes continuously, enabling frequent and reliable releases. `Infrastructure`

**Circuit Breaker** — Proxy that monitors failures; once a threshold is crossed it "opens" and stops forwarding requests, giving the downstream time to recover. `Patterns`

**Clean Architecture** — Layered design where business rules sit at the center, independent of frameworks, databases, and UI — dependencies point inward only. `Software Design`

**Clean Code Principles** — Guidelines (meaningful names, small functions, no duplication) for writing code that is readable and maintainable by the next engineer. `Software Design`

**Clocks & Ordering** — Techniques (Lamport timestamps, vector clocks, hybrid logical clocks) for establishing causal order of events across distributed nodes. `Distributed`

**Connection Pooling** — Maintaining a fixed set of reusable DB connections instead of opening and closing one per request. `Patterns`

**Consensus** — Distributed algorithm (Raft, Paxos) that gets multiple nodes to agree on a single value even in the presence of failures and partitions. `Distributed`

**Consistent Hashing** — Hash ring that maps keys to nodes such that adding or removing a node only remaps ~1/N of keys, avoiding mass cache misses. `Patterns`

**Consistency Models** — Spectrum of guarantees (linearizability → sequential → eventual) for how up-to-date reads are after a write. `Fundamentals`

**Containers & Docker** — Packaging an application and its dependencies into a portable, isolated image that runs identically across environments. `Infrastructure`

**CQRS (Command Query Responsibility Segregation)** — Pattern that separates write (command) and read (query) models so each can be optimized independently. `Patterns`

**CRDTs (Conflict-free Replicated Data Types)** — Data structures that can be updated concurrently on any replica and merged automatically without conflicts. `Distributed`

---

## D

**DPO (Direct Preference Optimisation)** — Fine-tuning method that directly optimises on human preference pairs (chosen vs rejected) without a separate reward model. `AI Engineering`

**Data Warehousing** — Columnar storage system optimized for analytical (OLAP) queries over large historical datasets, separate from the operational DB. `Storage`

**Dependency Injection (DI)** — Passing a class's dependencies from the outside rather than having the class create them, decoupling implementation from construction. `Software Design`

**Deployment Strategies** — Patterns (blue/green, canary, rolling) for releasing new software versions with controlled blast radius and rollback capability. `Infrastructure`

**Design Patterns (GoF)** — 23 reusable object-oriented patterns (creational, structural, behavioral) for solving recurring software design problems. `Software Design`

**Distributed Locks** — Mutual exclusion mechanism across multiple nodes to prevent concurrent access to a shared resource. `Distributed`

**Distributed Tracing** — Correlating instrumented spans across services to reconstruct the full path of a request end-to-end. `Observability`

**Distributed Transactions** — Atomically committing a transaction that spans multiple independent services or databases. `Distributed`

**DNS (Domain Name System)** — Hierarchical naming system that translates human-readable domain names into IP addresses. `Networking`

**Document Store** — NoSQL database that stores semi-structured data as JSON/BSON documents, queryable by any field without a fixed schema. `Storage`

---

## E

**Embedding** — Dense numerical vector representing the semantic meaning of text; similar texts produce geometrically nearby vectors, enabling semantic search. `AI Engineering`

**Eval (LLM Evaluation)** — Systematic measurement of AI system quality across dimensions like accuracy, faithfulness, and safety — the AI equivalent of a test suite. `AI Engineering`

**Encryption** — Transforming data into an unreadable form using a key, protecting it at rest and in transit from unauthorized access. `Security`

**Event Sourcing** — Storing state as an append-only log of immutable events rather than the current value, enabling full audit trail and time travel. `Patterns`

**Event Streaming** — Continuous real-time ingestion and processing of ordered, durable event logs (e.g. Kafka) as the source of truth. `Messaging`

**Event-Driven Architecture (EDA)** — Services communicate by emitting and consuming events asynchronously, decoupling producers from consumers. `Architecture`

**Eviction Policy** — Rule for deciding which cache entry to remove when memory is full (LRU, LFU, TTL, FIFO). `Caching`

---

## F

**Few-Shot Prompting** — Providing input→output examples in the prompt to demonstrate the expected pattern without updating model weights. `AI Engineering`

**Fine-Tuning** — Continuing training of a pre-trained model on domain-specific data to teach it new behaviour, style, or knowledge. `AI Engineering`

**Function Calling (Tool Use)** — Native LLM capability to call external tools by outputting structured JSON matching a declared tool schema. `AI Engineering`

**Failure Detection** — Mechanisms (heartbeats, gossip, phi accrual) for nodes to determine that a peer has crashed or become unreachable. `Distributed`

**FIFO Eviction** — Cache eviction policy that removes the oldest *inserted* entry regardless of how recently or frequently it was accessed. `Caching`

**The 8 Fallacies of Distributed Computing** — False assumptions engineers make about networks: the network is reliable, latency is zero, bandwidth is infinite, etc. `Distributed`

---

## G

**Gossip Protocol** — Decentralized epidemic-style protocol where each node randomly shares state with a few peers, eventually propagating information to all nodes. `Distributed`

**GraphQL** — API query language where clients specify the exact shape and depth of data they need in a single request. `API`

**gRPC** — High-performance RPC framework using HTTP/2 and Protocol Buffers for strongly-typed, low-latency service-to-service calls. `API`

---

## H

**Hallucination** — LLM confidently asserting false or fabricated information as fact; mitigated by RAG grounding, faithfulness checks, and abstain instructions. `AI Engineering`

**HNSW (Hierarchical Navigable Small World)** — The dominant ANN graph index for vector search; achieves O(log n) query time with high recall at millions of vectors. `AI Engineering`

**HyDE (Hypothetical Document Embeddings)** — RAG technique that generates a hypothetical answer first, then uses its embedding as the search query for better semantic match. `AI Engineering`

**Hexagonal Architecture (Ports & Adapters)** — Design where business logic is at the center with ports (interfaces) connecting to external adapters (DB, HTTP, queue), keeping the core independent. `Architecture`

**HTTP Versions** — Evolution from HTTP/1.1 (text, one request per connection) → HTTP/2 (multiplexing, header compression) → HTTP/3 (QUIC, UDP-based). `Networking`

**HyperLogLog** — Probabilistic data structure that estimates set cardinality (count distinct) using ≤12 KB of memory with ~0.81% error. `Caching`

---

## I

**Idempotency** — A request that produces the same result whether executed once or multiple times — essential for safe retries. `Patterns`

**Infrastructure as Code (IaC)** — Defining and provisioning infrastructure through version-controlled config files (Terraform, CloudFormation) rather than manual steps. `Infrastructure`

**Inversion of Control (IoC)** — Design principle where control of object creation and flow is delegated to a framework rather than the application code itself. `Software Design`

---

## J

**JWT (JSON Web Token)** — Compact, self-contained token that encodes claims as a signed JSON payload, used for stateless authentication. `Security`

---

## K

**KV Cache** — LLM inference optimisation that stores computed attention keys and values for already-processed tokens, reducing per-token compute from O(n²) to O(n). `AI Engineering`

**Kafka** — Distributed event streaming platform built around durable, partitioned, replicated commit logs with consumer group semantics. `Messaging`

**Key-Value Store** — Simplest NoSQL model: opaque values retrieved by a unique key, with no schema or query language. `Storage`

**Kubernetes (K8s)** — Container orchestration system that automates deployment, scaling, self-healing, and networking of containerized applications. `Infrastructure`

---

## L

**LLM (Large Language Model)** — Neural network trained to predict the next token at massive scale, producing models capable of reasoning, coding, and conversation. `AI Engineering`

**LLMOps** — Operational discipline for deploying, monitoring, and improving LLM-based systems in production: prompt versioning, cost tracking, eval pipelines, and rollback. `AI Engineering`

**LoRA (Low-Rank Adaptation)** — Parameter-efficient fine-tuning that trains small adapter matrices instead of full model weights, reducing trainable parameters by ~100×. `AI Engineering`

**Latency** — Time elapsed from sending a request to receiving the first byte of the response. `Fundamentals`

**Layered / N-Tier Architecture** — Organising a system into horizontal layers (presentation, business logic, data) where each layer only communicates with the layer below it. `Architecture`

**Leader Election** — Distributed algorithm for selecting one node to act as the coordinator, ensuring a single authoritative decision-maker at any time. `Distributed`

**LFU (Least Frequently Used)** — Cache eviction policy that removes the entry with the fewest total accesses over its lifetime. `Caching`

**Load Balancing** — Distributing incoming requests across multiple servers to maximise throughput, minimise latency, and avoid overloading any single node. `Networking`

**Logging** — Recording discrete, timestamped events to provide an audit trail, debugging information, and input for alerting. `Observability`

**LRU (Least Recently Used)** — Cache eviction policy that removes the entry that was accessed least recently, exploiting temporal locality. `Caching`

---

## M

**Message Queue** — Durable buffer that decouples producers and consumers, guaranteeing at-least-once delivery even when the consumer is temporarily offline. `Messaging`

**Metrics** — Numeric measurements sampled over time (counters, gauges, histograms) used to track system health and drive alerting. `Observability`

**Microservices Patterns** — Deployment and communication patterns (sidecar, ambassador, anti-corruption layer) specific to microservice architectures. `Architecture`

**Monolith vs Microservices** — Architectural choice between a single deployable unit (simple, tightly coupled) and independently deployable services (scalable, operationally complex). `Architecture`

**Multi-Tenancy** — Serving multiple customers from a shared infrastructure with logical (or physical) isolation between tenant data. `Architecture`

---

## N

**NewSQL** — Databases (CockroachDB, Spanner) that combine the ACID guarantees and SQL interface of relational DBs with horizontal scalability. `Storage`

---

## O

**OAuth 2.0** — Authorization framework that lets users delegate access to their resources to a third party without sharing credentials. `Security`

**On-Call & Incident Management** — Processes for detecting, responding to, and conducting post-mortems on production incidents. `Observability`

**Outbox Pattern** — Writing domain events to a DB outbox table in the same transaction as the business write, guaranteeing at-least-once message delivery. `Patterns`

---

## P

**PagedAttention** — vLLM's KV cache management system that allocates memory in non-contiguous pages, eliminating waste and enabling ~3× more effective batch sizes. `AI Engineering`

**Prompt Caching** — Reusing the computed KV state of a static prompt prefix across requests, reducing cost and latency by 40–60% for repeated system prompts. `AI Engineering`

**Prompt Engineering** — The practice of designing LLM inputs to reliably produce desired outputs — zero-shot, few-shot, CoT, structured output, and injection defence. `AI Engineering`

**Prompt Injection** — Attack where malicious user input or retrieved content overrides the system prompt's instructions, hijacking the model's behaviour. `AI Engineering`

**Pagination** — Splitting large result sets into discrete pages (offset, cursor, or keyset) to control response size and database load. `API`

**Proxies** — Intermediary servers that act on behalf of clients (forward proxy) or servers (reverse proxy) to route, cache, or transform traffic. `Networking`

**Pub/Sub** — Messaging pattern where publishers emit messages to named topics; subscribers receive all messages on their subscribed topics without direct coupling. `Messaging`

---

## Q

**Quantization** — Reducing model weight precision (FP16 → INT8 → INT4) to shrink memory footprint and increase throughput at the cost of a small quality drop. `AI Engineering`

**Quorum (R+W > N)** — Requiring a majority of nodes to acknowledge a read or write before it succeeds, ensuring at least one node always has the latest value. `Distributed`

---

## R

**RAG (Retrieval-Augmented Generation)** — Pattern that retrieves relevant documents at query time and injects them into the LLM prompt, grounding responses in your data. `AI Engineering`

**RAGAS** — Open-source framework for evaluating RAG pipelines across faithfulness, answer relevancy, context precision, and context recall. `AI Engineering`

**ReAct** — Agent pattern alternating between Thought (reasoning) and Action (tool call), enabling transparent step-by-step problem solving. `AI Engineering`

**Re-ranking** — Post-retrieval step that uses a cross-encoder to score and reorder top-K chunks by true relevance before injecting them into the prompt. `AI Engineering`

**RLHF (Reinforcement Learning from Human Feedback)** — Training technique that uses human preference comparisons to teach models to be helpful, harmless, and honest. `AI Engineering`

**Rate Limiting** — Controlling the number of requests a client can make in a time window to protect backends from abuse and ensure fair resource usage. `Patterns`

**Read Replicas** — Read-only copies of a primary database that serve read traffic, offloading the primary and enabling read scaling. `Patterns`

**Redis** — In-memory data structure store supporting strings, hashes, lists, sets, sorted sets, streams, and more — used as cache, database, and broker. `Caching`

**Refresh-Ahead** — Caching strategy where the cache proactively fetches fresh data before a hot key expires, eliminating cold-start latency. `Caching`

**Relational Databases** — Databases that store data in structured tables with schemas, foreign keys, joins, and ACID transactions (e.g. PostgreSQL, MySQL). `Storage`

**Replication** — Copying data to multiple nodes to increase durability, enable read scaling, and survive node failures. `Patterns`

**REST** — Stateless HTTP API style using resources (URLs), standard methods (GET/POST/PUT/DELETE), and uniform status codes. `API`

**Retry & Timeout** — Automatically retrying failed requests up to a limit, and aborting requests that exceed a maximum wait time. `Patterns`

---

## S

**SFT (Supervised Fine-Tuning)** — Fine-tuning a model on labelled input→output pairs to teach it specific tasks, formats, or domain behaviour. `AI Engineering`

**Semantic Cache** — Cache that returns stored LLM responses for semantically similar queries (not just exact matches), reducing cost and latency. `AI Engineering`

**Speculative Decoding** — LLM inference speedup where a small draft model predicts multiple tokens ahead and a large model validates them in one forward pass. `AI Engineering`

**Saga Pattern** — Manages a distributed transaction as a sequence of local transactions, each with a compensating transaction to undo it on failure. `Patterns`

**Scalability** — A system's ability to handle growing load by adding resources, either vertically (bigger machines) or horizontally (more machines). `Fundamentals`

**Search Engines** — Databases (Elasticsearch, OpenSearch) that build inverted indexes for full-text, faceted, and relevance-ranked queries. `Storage`

**Secrets Management** — Securely storing, rotating, auditing, and distributing credentials, API keys, and certificates (e.g. HashiCorp Vault, AWS Secrets Manager). `Security`

**Serverless Architecture** — Deploying functions that scale to zero and are fully managed by the cloud — no server provisioning or capacity planning required. `Architecture`

**Service Discovery** — Mechanism for services to dynamically find each other's network addresses without hardcoded configuration. `Distributed`

**Service Mesh** — Infrastructure layer (Istio, Linkerd) that handles service-to-service communication, mTLS, load balancing, and observability transparently. `Infrastructure`

**Service-Oriented Architecture (SOA)** — Coarse-grained services communicating via a shared enterprise service bus (ESB), the predecessor to microservices. `Architecture`

**Sharding** — Horizontally partitioning a database across multiple nodes by a shard key, so each node owns a subset of the data. `Patterns`

**SLI / SLO / SLA** — SLI measures what you achieve; SLO is the internal target; SLA is the contractual commitment to the customer with penalties for breach. `Observability`

**SOLID Principles** — Five OOP design guidelines (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion) for maintainable code. `Software Design`

**Strangler Fig Pattern** — Migration strategy for incrementally replacing a legacy system by routing traffic slice-by-slice to new services until the old system is fully retired. `Architecture`

---

## T

**Temperature** — LLM sampling parameter that controls output randomness; 0 = near-deterministic, 1 = default, >1 = creative/chaotic. `AI Engineering`

**Token** — The basic unit of text an LLM processes; roughly 4 characters or 0.75 words in English; all pricing and context limits are measured in tokens. `AI Engineering`

**Transformer** — Neural network architecture using self-attention that underlies every major LLM; allows every token to attend to every other token in context. `AI Engineering`

**TTFT (Time to First Token)** — Latency from sending a request to receiving the first generated token; the key user-perceived latency metric for streaming LLM responses. `AI Engineering`

**Testing Strategies** — Hierarchy of test types (unit, integration, contract, E2E) and when to use each to build confidence without excessive overhead. `Software Design`

**Throughput** — Number of requests a system processes per unit of time — the "how much" complement to latency's "how fast". `Fundamentals`

**Time-Series Database** — Database (InfluxDB, TimescaleDB) optimised for appending and querying sequential, timestamped measurements with time-range and aggregation queries. `Storage`

**TTL (Time-To-Live)** — Automatic expiry duration assigned to a cache entry after which it is evicted, bounding how stale data can get. `Caching`

**Twelve-Factor App** — Twelve-point methodology for building portable, scalable SaaS applications (config in env vars, stateless processes, dev/prod parity, etc.). `Architecture`

**Two-Phase Commit (2PC)** — Distributed commit protocol with a prepare phase and a commit phase, ensuring all participants agree before writing — blocking under coordinator failure. `Distributed`

---

## V

**Vector Database** — Database (Pinecone, pgvector, Weaviate) that stores high-dimensional embedding vectors and supports approximate nearest-neighbour similarity search. `Storage`

---

## W

**Webhooks** — HTTP callbacks where a server POSTs event data to a registered URL whenever something happens, pushing data rather than requiring polling. `API`

**WebSockets & SSE** — WebSockets: full-duplex persistent connection for real-time bidirectional communication. SSE: server-push unidirectional stream over HTTP. `Networking`

**Wide-Column Store** — NoSQL database (Cassandra, HBase) where rows can have different columns and data is stored by column family, optimised for sparse, wide tables. `Storage`

**Write-Behind (Write-Back)** — Caching strategy that acknowledges writes immediately after updating the cache, then flushes to the DB asynchronously — low latency, brief inconsistency risk. `Caching`

**Write-Through** — Caching strategy that synchronously writes to both cache and DB before acknowledging the client — keeps them consistent at the cost of write latency. `Caching`

---

## Z

**Zero Trust** — Security model that assumes no implicit trust inside or outside the network perimeter — every request must be authenticated, authorised, and encrypted. `Security`
