# Caching

Caching is the practice of storing copies of data in a fast-access layer so future requests can be served faster. It is one of the highest-leverage techniques in system design — used at every layer from CPU registers to global CDN edges.

## Suggested reading order

New to this topic? Read these in order — each builds on the previous:

1. [Caching Strategies](caching-strategies.md) — how data gets into and out of a cache; everything else assumes this vocabulary
2. [Eviction Policies](eviction-policies.md) — what happens when the cache is full
3. [Cache Invalidation](cache-invalidation.md) — the hard part: keeping the cache honest
4. [Redis Deep Dive](redis.md) — the tool you'll actually use to apply the first three
5. [Distributed Caching](distributed-caching.md) — sharding and replication once one node isn't enough

**Then, as needed (reference):** [Cache Patterns & Pitfalls](cache-patterns.md)

**Advanced — come back later:** [Cache Invalidation Applied](cache-invalidation-applied.md), [Distributed Cache Best Practices](distributed-cache-best-practices.md), [Cache Hierarchy](cache-hierarchy.md)

## Why cache?

```
Without cache:
  Request → App → Database (5–50ms)

With cache:
  Request → App → Cache hit (0.1–1ms)
  Request → App → Cache miss → Database → populate cache (5–50ms first time only)
```

**Core trade-off:** Speed vs. consistency. A cache is always a snapshot of truth. The question is how stale you can tolerate.

## Cache layers in a system

```mermaid
graph TD
    Client["Browser / Mobile Client"]
    ClientCache["Browser Cache\n(HTTP headers)"]
    CDN["CDN / Edge Cache\n(static assets, API responses)"]
    LB["Load Balancer"]
    AppCache["In-Process Cache\n(local HashMap, Guava, Caffeine)"]
    DistCache["Distributed Cache\n(Redis, Memcached)"]
    DBCache["DB Buffer Pool\n(InnoDB buffer, shared_buffers)"]
    DB["Database (source of truth)"]

    Client --> ClientCache
    ClientCache --> CDN
    CDN --> LB
    LB --> AppCache
    AppCache --> DistCache
    DistCache --> DBCache
    DBCache --> DB
```

Each layer adds latency but increases durability and consistency. Pick the right layer for the data's access pattern and staleness tolerance.

## Topics in this section

| Topic | What it covers |
|---|---|
| [Caching Strategies](caching-strategies.md) | Cache-aside, read-through, write-through, write-behind, refresh-ahead |
| [Eviction Policies](eviction-policies.md) | LRU, LFU, ARC, TTL, FIFO — when and why to use each |
| [Cache Invalidation](cache-invalidation.md) | TTL, event-driven, versioning, the two-phase problem |
| [Distributed Caching](distributed-caching.md) | Sharding, replication, Redis Cluster, consistency |
| [Redis Deep Dive](redis.md) | Data structures, persistence, clustering, pub/sub, use cases |
| [Cache Patterns & Pitfalls](cache-patterns.md) | Stampede, penetration, avalanche, warming strategies |

## The three cache problems (interview shortlist)

| Problem | Cause | Fix |
|---|---|---|
| **Cache stampede** | Hot key expires → burst of DB queries | Mutex, probabilistic early expiry, staggered TTL |
| **Cache penetration** | Queries for keys that don't exist (never cached) | Bloom filter, cache null values |
| **Cache avalanche** | Many keys expire simultaneously | TTL jitter, multi-level cache, circuit breaker |

## Related topics

- [Key-Value Stores](../storage/key-value-stores.md) — Redis as a primary database
- [CDN](../networking/cdn.md) — caching at the edge
- [Consistent Hashing](../patterns/consistent-hashing.md) — how distributed caches shard keys
- [Distributed Cache case study](../case-studies/distributed-cache.md) — full system design
