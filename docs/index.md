# System Design Encyclopedia

<div class="home-hero" markdown>
<p class="subtitle">Engineering reference, applied. Concepts, patterns, and the practical scenarios where they fit — built for recognition, not just reading.</p>
</div>

---

## Start here

Curated reading paths instead of a flat index. Pick the one that matches where you are.

<div class="grid cards" markdown>

-   :material-school-outline:{ .lg .middle } **Just the essentials**

    ---

    The 12 foundational concepts every backend engineer should know cold. ~3 hours of focused reading.

    [:octicons-arrow-right-24: Start the path](paths/essentials.md)

-   :material-message-question-outline:{ .lg .middle } **Interview prep (1 week)**

    ---

    25 pages covering the canon for senior+ backend / distributed systems interviews. Daily ~1 hour.

    [:octicons-arrow-right-24: Start the path](paths/interview-prep.md)

-   :material-rocket-launch-outline:{ .lg .middle } **Building a SaaS**

    ---

    18 pages on building a multi-tenant product end-to-end — from stack choice to multi-region.

    [:octicons-arrow-right-24: Start the path](paths/building-saas.md)

-   :material-call-split:{ .lg .middle } **Monolith → microservices**

    ---

    15 pages for the migration: how to know if you should, how to do it without big-bang rewrites.

    [:octicons-arrow-right-24: Start the path](paths/monolith-to-microservices.md)

-   :material-earth:{ .lg .middle } **Scaling beyond one region**

    ---

    10 pages on going global: multi-region, edge, data residency, eventual consistency.

    [:octicons-arrow-right-24: Start the path](paths/scaling-beyond-region.md)

</div>

---

## Common workflows

Different way to use the encyclopedia depending on what you're trying to do *right now*.

<div class="grid cards" markdown>

-   :material-stethoscope:{ .lg .middle } **I have a symptom at work**

    ---

    Diagnostic lookup: ~115 real-world symptoms ("one slow downstream is taking down our stack") mapped to the concept that explains them.

    [:octicons-arrow-right-24: Symptom → Concept Lookup](reference/symptom-lookup.md)

-   :material-lightbulb-on-outline:{ .lg .middle } **Show me real scenarios**

    ---

    22 practical scenarios across 6 categories — payments, real-time, scaling, multi-tenant. Each weaves multiple concepts together.

    [:octicons-arrow-right-24: Practical Examples](examples/index.md)

-   :material-source-branch-check:{ .lg .middle } **I'm designing — help me pick**

    ---

    Decision flowcharts for the 10 most common design choices: SQL vs NoSQL, REST vs gRPC, queue vs stream, and more.

    [:octicons-arrow-right-24: Decision Flowcharts](reference/decision-flowcharts.md)

-   :material-presentation:{ .lg .middle } **System design interview**

    ---

    Framework, common questions, what interviewers look for, and 15 full case studies.

    [:octicons-arrow-right-24: Interview Guide](interview-guide.md)

-   :material-book-search-outline:{ .lg .middle } **Look up one term**

    ---

    Glossary with one-line definitions of every concept in the encyclopedia.

    [:octicons-arrow-right-24: Glossary](glossary.md)

-   :material-notebook-outline:{ .lg .middle } **Full system designs**

    ---

    15 end-to-end designs: URL shortener, news feed, chat, video streaming, ride-sharing, payment systems.

    [:octicons-arrow-right-24: Case Studies](case-studies/index.md)

</div>

---

## Browse by topic

<div class="grid cards" markdown>

-   :material-layers-outline:{ .lg .middle } **Fundamentals**

    ---

    Numbers to know, hardware, OS, networking, data structures, distributed systems theory.

    [:octicons-arrow-right-24: Explore](fundamentals/index.md)

-   :material-brush-variant:{ .lg .middle } **Software Design**

    ---

    Clean code, SOLID, design patterns, DDD tactical, clean architecture, testing.

    [:octicons-arrow-right-24: Explore](software-design/index.md)

-   :material-sitemap-outline:{ .lg .middle } **Software Architecture**

    ---

    Decision-making, architectural styles, cross-cutting concerns, distribution, anti-patterns.

    [:octicons-arrow-right-24: Explore](architecture/index.md)

-   :material-server-network-outline:{ .lg .middle } **Distributed Systems**

    ---

    Consensus, leader election, locks, clocks, CRDTs, gossip, exactly-once semantics.

    [:octicons-arrow-right-24: Explore](distributed/index.md)

-   :material-database-outline:{ .lg .middle } **Storage**

    ---

    SQL vs NoSQL, relational, key-value, document, wide-column, time-series, search, vector, graph.

    [:octicons-arrow-right-24: Explore](storage/index.md)

-   :material-lightning-bolt-outline:{ .lg .middle } **Caching**

    ---

    Strategies, eviction, invalidation, distributed caching, Redis, stampede mitigation.

    [:octicons-arrow-right-24: Explore](caching/index.md)

-   :material-swap-horizontal:{ .lg .middle } **Networking**

    ---

    DNS, CDN, load balancing, proxies, API gateway, WebSockets, HTTP versions.

    [:octicons-arrow-right-24: Explore](networking/index.md)

-   :material-api:{ .lg .middle } **API Design**

    ---

    REST, gRPC, GraphQL, webhooks, versioning, pagination.

    [:octicons-arrow-right-24: Explore](api/index.md)

-   :material-message-arrow-right-outline:{ .lg .middle } **Messaging & Streaming**

    ---

    Queues, pub/sub, event streaming, Kafka deep dive, backpressure.

    [:octicons-arrow-right-24: Explore](messaging/index.md)

-   :material-puzzle-outline:{ .lg .middle } **Patterns**

    ---

    Rate limiting, circuit breaker, retry, idempotency, saga, outbox, CQRS, sharding.

    [:octicons-arrow-right-24: Explore](patterns/index.md)

-   :material-chart-line:{ .lg .middle } **Observability**

    ---

    Logging, metrics, distributed tracing, alerting, SLI/SLO/SLA, incidents.

    [:octicons-arrow-right-24: Explore](observability/index.md)

-   :material-shield-lock-outline:{ .lg .middle } **Security**

    ---

    AuthN/AuthZ, OAuth 2.0, JWT, API security, encryption, zero trust, secrets.

    [:octicons-arrow-right-24: Explore](security/index.md)

-   :material-docker:{ .lg .middle } **Infrastructure**

    ---

    Containers, Kubernetes, service mesh.

    [:octicons-arrow-right-24: Explore](infrastructure/index.md)

-   :material-file-code-outline:{ .lg .middle } **IaC**

    ---

    Terraform end-to-end, state management, modules, CDK, drift detection, security.

    [:octicons-arrow-right-24: Explore](iac/index.md)

-   :material-source-branch-sync:{ .lg .middle } **CI/CD**

    ---

    Pipelines, branching, build/test, artifacts, deployment, GitOps, progressive delivery.

    [:octicons-arrow-right-24: Explore](cicd/index.md)

-   :material-robot-outline:{ .lg .middle } **AI Agents**

    ---

    Agent fundamentals, function calling, multi-agent systems, reliability, 3 examples.

    [:octicons-arrow-right-24: Explore](agents/index.md)

-   :material-brain:{ .lg .middle } **AI Engineering**

    ---

    LLMs, RAG, embeddings, fine-tuning, evaluation, guardrails, LLMOps.

    [:octicons-arrow-right-24: Explore](ai/index.md)

-   :material-aws:{ .lg .middle } **AWS Mapping**

    ---

    Every concept mapped to the AWS service that implements it.

    [:octicons-arrow-right-24: Explore](aws/index.md)

</div>

---

## Page contract

Every concept page follows the same shape, so you always know what to expect:

| Section | What it covers |
|---|---|
| **What it is** | One-paragraph definition — the problem it solves |
| **You'll see this when...** | Real-world symptoms — recognise the concept in your work |
| **How it works** | Mechanics with diagrams and code |
| **When to use it** | Signals, use cases, decision triggers |
| **Tradeoffs** | Pros, cons, failure modes, cost |
| **Interview angle** | How it comes up, what to say, common follow-ups |
| **Related topics** | Cross-links to neighbouring concepts |

---

## How to read this site

```
Linear reader  → pick a Start Here path; read in order
Diagnostic     → Symptom Lookup; jump to whatever matches your problem
Decision       → Decision Flowcharts; pick the tree for your choice
Reference      → Browse by Topic; find the concept; read its page
Interview prep → Interview Guide + Interview Prep path + Case Studies
Search         → Cmd+K from anywhere — full-text across all pages
```
