# System Design Encyclopedia

A comprehensive personal reference for system design, distributed systems, software architecture, and interview preparation — built as a static site with MkDocs Material.

## What's inside

| Section | Topics |
|---|---|
| **Fundamentals** | Networking basics, estimation, ACID vs BASE, CAP theorem, consistency models, storage internals, probabilistic data structures, serialization, concurrency |
| **Software Design** | Clean code, SOLID, design patterns (GoF), DDD tactical patterns, clean architecture, refactoring, error handling, testing |
| **Software Architecture** | Microservices, DDD, event-driven, serverless, hexagonal, twelve-factor, strangler fig, BFF, data mesh, multi-tenancy |
| **Distributed Systems** | Consensus (Raft/Paxos), leader election, split brain & fencing, distributed locks, quorum, clocks & ordering, exactly-once semantics, CRDTs, gossip, failure detection |
| **Storage** | Relational, key-value, document, wide-column, time-series, search engines, blob storage, data warehousing, NewSQL, vector databases, graph databases |
| **Caching** | Cache-aside/read-through/write-through, eviction policies (LRU/LFU/ARC), cache invalidation, distributed caching, Redis deep dive, stampede & avalanche |
| **Networking** | DNS, CDN, load balancing (L4/L7), proxies, API gateway, WebSockets & SSE, HTTP/1.1 vs HTTP/2 vs HTTP/3 |
| **API Design** | REST, gRPC, GraphQL, comparison framework, webhooks, versioning, pagination |
| **Messaging & Streaming** | Message queues, pub/sub, event streaming, Kafka deep dive, backpressure |
| **Patterns** | Rate limiting, circuit breaker, retry & timeout, backoff, bulkhead, idempotency, saga, outbox, CQRS, event sourcing, consistent hashing, sharding, replication |
| **Observability** | Structured logging, metrics (RED/USE), distributed tracing, alerting, SLI/SLO/SLA, on-call & incident management |
| **Security** | AuthN/AuthZ, OAuth 2.0 & JWT, API security (OWASP), encryption, zero trust, secrets management |
| **Infrastructure** | Containers & Docker, Kubernetes, CI/CD, deployment strategies, infrastructure as code, service mesh |
| **AI Agents** | Agent fundamentals, function calling & tool use, building agents, multi-agent systems, reliability — with 3 end-to-end examples |
| **AI Engineering** | LLM fundamentals, prompt engineering, embeddings & vector search, RAG, agentic patterns, memory systems, fine-tuning, LLM inference, evaluation, guardrails, LLMOps |
| **AWS Mapping** | Every concept mapped to its AWS service equivalent |
| **Case Studies** | 15 end-to-end designs: URL shortener, news feed, chat, video streaming, ride-sharing, payment system, ad click tracking, Google Maps, and more |

## Running locally

```bash
pip install -r requirements.txt
mkdocs serve --dirty   # --dirty: fast rebuilds (full builds take ~40s due to git-date plugin)
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

## CI and deployment

The site is **local-only** for now. CI (`.github/workflows/deploy.yml`) runs `mkdocs build --strict` on every push as a link-check gate — broken internal links fail the build — but does not publish anywhere.

**To deploy to GitHub Pages later** (everything is prepared, just disabled):

1. Repo **Settings → Pages → Source → "GitHub Actions"**
2. In `.github/workflows/deploy.yml`, uncomment the marked blocks (`pages`/`id-token` permissions, the `upload-pages-artifact` step, and the `deploy` job)
3. Push — the site publishes to `https://<user>.github.io/system-design/` on every push to `main`

> ⚠️ On the free plan, Pages for a **private** repo still publishes the site **publicly**. Access-controlled Pages needs GitHub Enterprise; alternatives with auth: Cloudflare Pages + Access, or an S3 + CloudFront + signed-cookie setup.

## Structure

```
docs/
├── index.md                  # Home page
├── interview-guide.md        # Interview prep guide
├── glossary.md               # Term definitions
├── fundamentals/
├── software-design/
├── architecture/
├── distributed/
├── storage/
├── caching/
├── networking/
├── api/
├── messaging/
├── patterns/
├── observability/
├── security/
├── infrastructure/
├── agents/
├── ai/
├── aws/
└── case-studies/
```

## Design principles

- **Deep over broad** — mechanics, tradeoffs, and failure modes, not just definitions
- **Interview-ready** — every page has an "Interview angle" section with realistic Q&A
- **Connected** — topics cross-reference each other; the knowledge forms a graph, not a list
- **Practical** — working code examples, real library APIs, runnable agent examples
