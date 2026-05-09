# System Design Encyclopedia — Project Goals & Prompt

## What this is

A personal, comprehensive reference for system design concepts, distributed systems theory, software architecture patterns, and interview preparation. Built as a static MkDocs site with the Material theme.

## Goals

### 1. Deep, not shallow
Each topic should go beyond a Wikipedia-level definition. The target depth is:
- What problem it solves and why it exists
- How it actually works (mechanics, data structures, algorithms)
- When to use it — concrete signals and decision triggers
- Tradeoffs, failure modes, and gotchas
- Working code examples where applicable
- Interview angle: how it comes up, what to say, common follow-ups

### 2. Connected, not isolated
Topics should reference each other meaningfully. A page on Kafka should link to Exactly-Once Semantics, Backpressure, and the relevant Case Studies. The goal is a web of knowledge, not a collection of standalone articles.

### 3. Interview-ready
Every page ends with an "Interview angle" section. The Case Studies section covers 15 end-to-end designs. The index of each section has an interview shortlist. A reader should be able to use this as preparation for senior+ backend and distributed systems interviews.

### 4. Practical and runnable
The AI Agents section includes full, working Python examples. Code examples throughout use real libraries (Kafka, Redis, PostgreSQL) and realistic patterns, not toy pseudocode.

### 5. AWS-aware
A dedicated AWS Mapping section bridges abstract concepts to concrete managed services. Useful for both real architecture decisions and the AWS Solutions Architect exam.

---

## Content structure

```
docs/
├── fundamentals/     17 topics — networking, estimation, ACID, CAP, storage internals
├── software-design/   9 topics — clean code, SOLID, DDD tactical, error handling, testing
├── architecture/     14 topics — microservices, DDD, event-driven, serverless, data mesh
├── distributed/      15 topics — consensus, locks, clocks, CRDTs, gossip, exactly-once
├── storage/          13 topics — relational, NoSQL, time-series, vector, graph databases
├── caching/           6 topics — strategies, eviction, invalidation, Redis, stampede
├── networking/        7 topics — DNS, CDN, load balancing, API gateway, HTTP versions
├── api/               7 topics — REST, gRPC, GraphQL, webhooks, versioning, pagination
├── messaging/         5 topics — queues, pub/sub, event streaming, Kafka, backpressure
├── patterns/         15 topics — rate limiting, circuit breaker, saga, CQRS, sharding
├── observability/     6 topics — logging, metrics, tracing, alerting, SLO/SLA, incidents
├── security/          6 topics — auth, OAuth/JWT, API security, encryption, zero trust
├── infrastructure/    6 topics — containers, Kubernetes, CI/CD, deployments, IaC, mesh
├── agents/            8 topics — agent fundamentals, building agents, multi-agent, 3 examples
├── ai/               12 topics — LLM fundamentals, RAG, embeddings, fine-tuning, LLMOps
├── aws/               6 topics — compute, storage, networking, messaging, observability, security
└── case-studies/     15 systems — URL shortener through Google Maps
```

---

## Writing conventions

- **Tone:** Direct, engineering-focused. No filler. Every sentence should add information.
- **Code:** Python or language-agnostic pseudocode. Use real library APIs where possible.
- **Diagrams:** ASCII for architecture flows, Mermaid for sequence/graph diagrams.
- **Admonitions:** Use `!!! tip` for interview angles only. Don't overuse callout boxes.
- **Related topics:** Always include at the bottom. Cross-link liberally.
- **Page length:** 200–600 lines is the target range. Thin pages feel incomplete; very long pages should be split.

---

## Tech stack

- **Generator:** MkDocs with Material theme
- **Extensions:** Admonition, PyMdown (superfences, tabbed, tasklist, emoji), Mermaid, syntax highlighting
- **Fonts:** Inter (body), JetBrains Mono (code)
- **Color:** Custom blue palette (light + dark mode)

## Running locally

```bash
pip install mkdocs-material
mkdocs serve        # live reload at http://127.0.0.1:8000
mkdocs build        # static site to site/
```
