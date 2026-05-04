# System Design Encyclopedia

<div class="home-hero" markdown>
<p class="subtitle">A personal reference for system design concepts, distributed systems patterns, architecture decisions, and interview preparation.</p>
</div>

---

<div class="grid cards" markdown>

-   :material-brain:{ .lg .middle } **AI Engineering**

    ---

    LLMs, RAG, agents, embeddings, fine-tuning, guardrails, LLMOps

    [:octicons-arrow-right-24: Explore](ai/index.md)

-   :material-brush-variant:{ .lg .middle } **Software Design**

    ---

    Clean code, SOLID principles, design patterns, clean architecture, testing strategies

    [:octicons-arrow-right-24: Explore](software-design/index.md)

-   :material-layers-outline:{ .lg .middle } **Fundamentals**

    ---

    ACID vs BASE, CAP theorem, consistency models, scalability, availability, estimation

    [:octicons-arrow-right-24: Explore](fundamentals/index.md)

-   :material-sitemap-outline:{ .lg .middle } **Software Architecture**

    ---

    Microservices, DDD, event-driven, serverless, strangler fig, twelve-factor

    [:octicons-arrow-right-24: Explore](architecture/index.md)

-   :material-server-network-outline:{ .lg .middle } **Distributed Systems**

    ---

    Consensus, leader election, distributed locks, clocks, gossip, failure detection

    [:octicons-arrow-right-24: Explore](distributed/index.md)

-   :material-lightning-bolt-outline:{ .lg .middle } **Caching**

    ---

    Strategies, eviction policies, cache invalidation, Redis deep dive, stampede & avalanche

    [:octicons-arrow-right-24: Explore](caching/index.md)

-   :material-database-outline:{ .lg .middle } **Storage**

    ---

    SQL vs NoSQL, relational, key-value, document, wide-column, time-series, search engines

    [:octicons-arrow-right-24: Explore](storage/index.md)

-   :material-swap-horizontal:{ .lg .middle } **Networking**

    ---

    DNS, CDN, load balancing, proxies, API gateway, WebSockets, HTTP versions

    [:octicons-arrow-right-24: Explore](networking/index.md)

-   :material-api:{ .lg .middle } **API Design**

    ---

    REST, gRPC, GraphQL, webhooks, versioning, pagination

    [:octicons-arrow-right-24: Explore](api/index.md)

-   :material-message-arrow-right-outline:{ .lg .middle } **Messaging & Streaming**

    ---

    Message queues, pub/sub, event streaming, Kafka deep dive, backpressure

    [:octicons-arrow-right-24: Explore](messaging/index.md)

-   :material-puzzle-outline:{ .lg .middle } **Patterns**

    ---

    Rate limiting, circuit breaker, CQRS, saga, consistent hashing, sharding, outbox

    [:octicons-arrow-right-24: Explore](patterns/index.md)

-   :material-chart-line:{ .lg .middle } **Observability**

    ---

    Logging, metrics, distributed tracing, alerting, SLI/SLO/SLA, incident management

    [:octicons-arrow-right-24: Explore](observability/index.md)

-   :material-shield-lock-outline:{ .lg .middle } **Security**

    ---

    AuthN/AuthZ, OAuth 2.0, JWT, API security, encryption, zero trust

    [:octicons-arrow-right-24: Explore](security/index.md)

-   :material-docker:{ .lg .middle } **Infrastructure**

    ---

    Containers, Kubernetes, CI/CD, deployment strategies, IaC, service mesh

    [:octicons-arrow-right-24: Explore](infrastructure/index.md)

-   :material-aws:{ .lg .middle } **AWS Mapping**

    ---

    Every concept mapped to the AWS service that implements it

    [:octicons-arrow-right-24: Explore](aws/index.md)

-   :material-notebook-outline:{ .lg .middle } **Case Studies**

    ---

    URL shortener, news feed, chat, video streaming, distributed cache, and 11 more

    [:octicons-arrow-right-24: Explore](case-studies/index.md)

</div>

---

## Interview framework

Every page follows the same structure so you always know what to expect:

| Section | What it covers |
|---|---|
| **What it is** | Concise definition — what problem it solves |
| **How it works** | Mechanics with diagrams and code |
| **When to use it** | Signals, use cases, and decision triggers |
| **Tradeoffs** | Pros, cons, and failure modes |
| **AWS equivalent** | Service mapping for cloud context |
| **Interview angle** | How this comes up, what to say, common follow-ups |

## System design steps

1. **Clarify requirements** — functional vs non-functional before drawing anything
2. **Estimate scale** — QPS, storage, bandwidth back-of-envelope
3. **Pick primitives** — choose the right storage, messaging, and compute components
4. **Deep dive** — bottlenecks, tradeoffs, and failure modes
5. **Wrap up** — summarize decisions, acknowledge limitations
