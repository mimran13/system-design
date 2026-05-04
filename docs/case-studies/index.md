# Case Studies

End-to-end system designs. Each one follows the full interview flow: requirements → estimation → design → deep dive → tradeoffs.

| System | Key Concepts Covered |
|---|---|
| [URL Shortener](url-shortener.md) | Hashing, redirection, caching, DB choice |
| [Rate Limiter](rate-limiter.md) | Algorithms, distributed counters, Redis |
| [News Feed](news-feed.md) | Fan-out, ranking, caching at scale |
| [Chat System](chat-system.md) | WebSockets, message ordering, presence |
| [Notification Service](notification-service.md) | Pub/sub, delivery guarantees, retry |
| [Search Autocomplete](search-autocomplete.md) | Trie, top-K, caching prefix results |
| [Video Streaming](video-streaming.md) | CDN, chunking, adaptive bitrate, storage |
| [Ride-Sharing](ride-sharing.md) | Geo-matching, location updates, dispatch |
| [Distributed Cache](distributed-cache.md) | LRU, consistent hashing, hot keys, stampede |
| [Web Crawler](web-crawler.md) | URL frontier, politeness, dedup, distributed workers |
| [Cloud File Storage (Dropbox)](dropbox.md) | Chunking, block dedup, sync protocol, conflict resolution |
| [Social Media Feed (Twitter)](twitter.md) | Fan-out, celebrity problem, Snowflake IDs, trending |
| [Payment System](payment-system.md) | Double-entry ledger, idempotency, reconciliation, exactly-once |
| [Ad Click Tracking](ad-click-tracking.md) | Extreme write volume, Kafka pipeline, Bloom dedup, ClickHouse |
| [Maps & Navigation](google-maps.md) | Tile serving, A* routing, Contraction Hierarchies, live traffic |

---

## Interview Framework

Use this structure for every design:

```
1. Clarify requirements (5 min)
   - Functional: what does it do?
   - Non-functional: scale, latency, availability, consistency

2. Estimate scale (3 min)
   - DAU, QPS (read/write ratio), storage, bandwidth

3. High-level design (10 min)
   - Core components: clients, servers, storage, async workers
   - Data flow diagram

4. Deep dive (15 min)
   - Pick 2-3 components to go deep on
   - Address bottlenecks and failure modes

5. Wrap up (2 min)
   - Summarize key decisions
   - Acknowledge tradeoffs and what you'd do with more time
```
