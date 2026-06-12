# Case Studies

End-to-end system designs. Each one follows the full interview flow: requirements → estimation → high-level design → deep dive → tradeoffs. Reading these after understanding the underlying concepts is more valuable than reading them first — the goal is to see *why* each decision was made, not memorize a template.

## Suggested reading order

New to this topic? Read these in order — each builds on the previous:

1. [URL Shortener](url-shortener.md) — the canonical first design: smallest scope, teaches the full interview flow
2. [Rate Limiter](rate-limiter.md) — still small, but adds distributed coordination and Redis algorithms
3. [Chat System](chat-system.md) — first real-time system: WebSockets, ordering, delivery guarantees
4. [News Feed](news-feed.md) — the classic fan-out read/write tradeoff at scale
5. [Notification Service](notification-service.md) — async pipelines, at-least-once delivery, and retries

**Then, as needed (reference):** [Search Autocomplete](search-autocomplete.md), [Video Streaming](video-streaming.md), [Ride-Sharing](ride-sharing.md), [Distributed Cache](distributed-cache.md), [Web Crawler](web-crawler.md), [Cloud File Storage (Dropbox)](dropbox.md), [Social Media Feed (Twitter)](twitter.md), [Ad Click Tracking](ad-click-tracking.md)

**Advanced — come back later:** [Payment System](payment-system.md), [Maps & Navigation](google-maps.md), [PropTech Buyer-Seller Chat](proptech-chat.md)

---

## The systems

| System | Difficulty | Key concepts |
|---|---|---|
| [URL Shortener](url-shortener.md) | Starter | Hashing (MD5/base62), cache-aside, 301 vs 302, single-write DB |
| [Rate Limiter](rate-limiter.md) | Starter | Token bucket, Redis counters, sliding window log, distributed coordination |
| [News Feed](news-feed.md) | Medium | Fan-out on write vs read, ranking signals, Redis sorted sets, CDN |
| [Chat System](chat-system.md) | Medium | WebSockets, message ordering, delivery receipts, presence detection |
| [Notification Service](notification-service.md) | Medium | Pub/Sub, at-least-once delivery, retry with backoff, device token management |
| [Search Autocomplete](search-autocomplete.md) | Medium | Trie, top-K with heap, prefix caching, real-time vs offline updates |
| [Video Streaming](video-streaming.md) | Medium | CDN edge caching, HLS chunking, adaptive bitrate, blob storage |
| [Ride-Sharing](ride-sharing.md) | Medium | Geohashing, location update pipeline, ETA computation, dispatch matching |
| [Distributed Cache](distributed-cache.md) | Medium | LRU implementation, consistent hashing, hot key mitigation, stampede |
| [Web Crawler](web-crawler.md) | Hard | URL frontier (priority queue), politeness delay, Bloom dedup, distributed workers |
| [Cloud File Storage (Dropbox)](dropbox.md) | Hard | Content-addressed chunking, block dedup, delta sync, conflict resolution |
| [Social Media Feed (Twitter)](twitter.md) | Hard | Fan-out celebrity problem, Snowflake IDs, timeline caching, trending topics |
| [Payment System](payment-system.md) | Hard | Double-entry ledger, idempotency key, reconciliation, exactly-once |
| [Ad Click Tracking](ad-click-tracking.md) | Hard | Extreme write volume (1M+ RPS), Kafka pipeline, Bloom dedup, ClickHouse |
| [Maps & Navigation](google-maps.md) | Hard | Tile serving at scale, graph routing (A*, Contraction Hierarchies), live traffic |

---

## Concept coverage matrix

Use this to find case studies that reinforce a specific concept:

| Concept | Case studies that use it |
|---|---|
| **Consistent hashing** | Distributed Cache, Twitter |
| **Caching (Redis)** | URL Shortener, Rate Limiter, News Feed, Distributed Cache |
| **Fan-out** | News Feed, Twitter |
| **WebSockets / real-time** | Chat System, Ride-Sharing |
| **Kafka / event streaming** | Ad Click Tracking, Payment System, Notification Service |
| **Idempotency / exactly-once** | Payment System, Notification Service |
| **Geo-indexing / spatial** | Ride-Sharing, Maps & Navigation |
| **CDN / blob storage** | Video Streaming, Dropbox, Twitter |
| **Bloom filter** | Web Crawler, Ad Click Tracking |
| **Sharding** | Twitter (by user ID), Ad Click Tracking (by ad ID) |
| **CQRS** | Ad Click Tracking (write pipeline ≠ read API) |
| **Rate limiting** | Rate Limiter, API Gateway in most systems |
| **Distributed locks** | Payment System, Distributed Cache |
| **Trie / prefix search** | Search Autocomplete |
| **Snowflake IDs** | Twitter, Chat System |

---

## Interview framework

Use this structure for every design. Time budget for a 45-minute interview:

```
1. Clarify requirements (5 min)
   Functional: what does it do? (core features, out of scope)
   Non-functional: scale, latency SLO, availability, consistency
   → Ask, don't assume. The constraints define the design.

2. Estimate scale (3 min)
   DAU × actions/day = QPS
   QPS × avg payload = bandwidth
   QPS × retention = storage
   → Rough orders of magnitude. Don't over-engineer estimates.

3. High-level design (10 min)
   Client → LB → App servers → Storage
   Add: cache, CDN, async workers, message queue
   → Whiteboard the data flow. Talk through every arrow.

4. Deep dive (15 min)
   Pick 2-3 components to go deep on (let interviewer guide)
   Typical targets: DB schema, sharding key, cache strategy,
                    async pipeline, hot key problem
   → This is where you show you've thought past the happy path.

5. Wrap up (2 min)
   Summarize key decisions
   Acknowledge tradeoffs
   What you'd add with more time (monitoring, multi-region, etc.)
```

---

## Common mistakes in system design interviews

| Mistake | Fix |
|---|---|
| Jumping to solution without requirements | Always clarify scale and constraints first |
| Over-engineering a simple system | Match complexity to the actual scale |
| Ignoring failure modes | Ask: what happens when X fails? |
| Choosing a DB without justifying it | State the access pattern, then choose |
| Forgetting caching | Almost every read-heavy system needs it |
| Treating exactly-once as free | Acknowledge the complexity, use idempotency |
| Single-region design for a global system | Address multi-region if non-functional reqs demand it |

---

## Related topics

- [Fundamentals: Back-of-Envelope Estimation](../fundamentals/estimation.md) — step 2 of every design
- [Storage](../storage/index.md) — database selection is a core design decision in every case study
- [Patterns](../patterns/index.md) — the building blocks used across all designs
- [Distributed Systems](../distributed/index.md) — the theory behind the hard parts
