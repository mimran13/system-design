# Throughput Limits: Amdahl's & Universal Scalability Law

Doubling the cores doesn't double the throughput. Adding the tenth server doesn't add 10× the capacity of one. Two laws explain why: **Amdahl's Law** (sequential portions cap parallelism) and the **Universal Scalability Law** (coordination costs make scaling actively harmful past a point). Senior engineers use these to set realistic expectations and find bottlenecks.

---

## Amdahl's Law

If a fraction `p` of the work can be parallelised and `1 − p` is sequential, the maximum speedup with N processors is:

```
speedup(N) = 1 / ( (1 − p) + p/N )
```

```
p = 0.95   95% parallel
N = 1:    speedup = 1.0
N = 4:    speedup = 3.5
N = 16:   speedup = 9.1
N = 100:  speedup = 16.8
N = ∞:    speedup = 20.0   ← ceiling: 1 / (1 − 0.95) = 20
```

The serial 5% fraction caps total speedup at 20×, no matter how many cores.

```
p = 0.99    99% parallel  → ceiling 100×
p = 0.999   99.9% parallel → ceiling 1000×
p = 0.50    50% parallel  → ceiling 2×
```

The "ceiling" is the most important lesson: **scaling is bounded by the sequential fraction**.

---

## What "sequential" means in practice

In real systems, "sequential" is anything that forces serialisation:

- **Locks**: only one thread holds it at a time
- **Single coordinator**: leader, master, primary
- **Shared-state reads/writes**: one writer at a time
- **Configuration / startup**: one-time costs
- **Network round-trips with serial dependencies**

Things you might think are parallel but aren't:

- 100 threads competing for one mutex → effectively sequential while contended
- 10 services calling one downstream service → bottlenecked by that service
- Shared cache with hot key → serialised at that key

Profiling for Amdahl: find the sequential bottleneck, not the parallel work.

---

## Universal Scalability Law (USL)

Amdahl assumes adding processors is free apart from the unparallelisable work. USL adds a second cost: **coordination overhead** between processors:

```
throughput(N) = N / ( 1 + α(N − 1) + β · N · (N − 1) )
```

- `α` = contention (sequential fraction, like Amdahl)
- `β` = coherency / coordination cost (grows with N²)

```
α = 0.05, β = 0.01:
N = 1:    throughput = 1.0
N = 10:   throughput = 6.9
N = 50:   throughput = 13.4   ← peak
N = 100:  throughput = 11.7   ← past peak; adding more hurts
N = 500:  throughput = 4.5    ← significantly worse
```

USL predicts a **peak** beyond which adding capacity makes things slower. This matches real measurements: databases, locks, distributed systems all hit a knee curve and degrade.

---

## Why coordination cost is N² (or worse)

In an N-node system, coordination involves N(N-1)/2 pairs:

- All-to-all heartbeats: O(N²)
- Group membership consensus: depends on protocol (Raft is N, Gossip is log N to converge)
- Cache coherency in multi-socket: O(N) → O(N²) on writes
- Database with N writers + 1 row: lock contention → wait queue grows

This is why "scaling out" without thought hits walls. The fix is reducing coordination, not adding nodes:

- Sharding (independent groups, no coordination)
- Caching (avoid the coordination hot path)
- Eventual consistency (defer coordination)
- Approximation (accept slightly wrong answers for less coordination)

---

## How this looks in real systems

### Database connection pools

A single Postgres can handle ~100-300 concurrent transactions before contention dominates. Past that, throughput drops as transactions queue.

```
50 conns:   1500 tps
100 conns:  3000 tps
200 conns:  3500 tps   ← knee
500 conns:  3200 tps   ← past knee, worse
```

Solution: PgBouncer transaction pooling so 5000 app workers share 100 backend connections.

### Hot keys in distributed caches

```
1 key holds 50% of traffic → that single key's coordination is the bottleneck
Adding more cache nodes doesn't help (key lives on one node)
```

Solution: replicate hot keys, partition by sub-key, or cache at the app layer.

### Microservice fan-out

```
1 client request → fans out to 50 downstream calls
P99 of one downstream: 100 ms
P99 of the request: ~250 ms (not 100 ms — tail amplifies)
```

The "tail at scale" effect: P99 latencies of 50 calls combine non-linearly.

### Lock contention

```
10 threads, 1 mutex held for 1 ms each:
  Sequentially: 10 ms total → 1000 ops/s
  With contention: same 10 ms (mutex serialises)
  
With 100 threads competing for that mutex:
  Still 1000 ops/s — adding threads makes it worse due to context switching
```

---

## Implications for architecture

### Find the serial fraction first

Before scaling, identify what serialises requests:

- Shared lock?
- Single database?
- Synchronous service call?
- Message queue with one consumer?

Doubling the rest is wasted unless you reduce the serial fraction.

### Coordination is expensive

Architectures that minimise coordination scale better:

- Shared-nothing (each node operates independently)
- Eventual consistency (defer coordination)
- Hierarchical replication (avoid all-to-all)
- Idempotent / commutative operations (reorder freely)

### Beware the knee

USL says throughput peaks then declines. Capacity planning should target **safely below the knee**, not maximum capacity:

```
Run at 70% of peak utilisation
   ↓
Latency stays low
Coordination cost stays manageable
Spike capacity available
```

A system "at full capacity" per Amdahl may be in collapse per USL.

---

## Measuring α and β

For a real system, run benchmarks at several scale levels:

```
N = 1:    1000 ops/s
N = 2:    1900 ops/s
N = 4:    3500 ops/s
N = 8:    6000 ops/s
N = 16:   8500 ops/s
N = 32:   9500 ops/s
N = 64:   8000 ops/s   ← past peak
```

Fit USL: gives you α and β. Project: peak throughput, scaling limit, coordination cost.

Tools: Neil Gunther's `usl` R package, his book *Guerrilla Capacity Planning*.

---

## When Amdahl/USL doesn't apply

Some workloads truly are embarrassingly parallel:

- Map-reduce on independent shards (no coordination per record)
- Stateless web requests with separate downstream resources
- Image processing on independent files

These scale linearly until external resources (network, storage IOPS) bottleneck — at which point USL applies again at that layer.

---

## Practical examples

### Why a 10-node cluster doesn't have 10× a single node's capacity

| Cause | Impact |
|---|---|
| Replication overhead | Each write goes to 3 nodes (3× per write) |
| Quorum reads | 2 of 3 nodes responding (no speedup vs single) |
| Coordinator routing | One node forwards each request |
| Anti-entropy / gossip | Background coordination traffic |
| Shared metadata | Schema, config — lock contention |

Real-world distributed databases (Cassandra, DynamoDB) achieve 5-7× of single-node capacity at 10 nodes, not 10×.

### Why a multi-core CPU at 100% doesn't always do more

```
Code with shared mutex in hot path:
  1 core: 100K ops/s
  4 cores: 130K ops/s   ← contention dominates
  8 cores: 80K ops/s    ← context switching, cache invalidation
```

Lock-free or sharded data structures avoid this.

### Why a database with 1000 connections may serve fewer requests than with 100

| Connections | Backend behaviour |
|---|---|
| 100 | Below contention threshold; happy |
| 500 | Lock waits, longer queries, page contention |
| 1000 | Major slowdown, possible collapse |

Connection pooling layers (PgBouncer) cap concurrent backends at the optimal point.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you can explain why systems don't scale linearly — and what to do about it.

**Strong answer pattern:**
1. Amdahl: sequential fraction caps maximum speedup; can't beat (1 − p)
2. USL: coordination overhead grows with N (or N²); throughput peaks then declines
3. Find the serial bottleneck before adding capacity
4. Architecture choices that reduce coordination scale better: sharding, eventual consistency, idempotency
5. Capacity plan below the knee — not at peak utilisation

**Common follow-up:** *"You've tripled your servers but throughput only went up 50%. Why?"*
> Some component is serialising requests. Could be: shared database (lock contention), single coordinator, downstream service bottleneck, hot cache key, or the load balancer itself. Adding more frontend doesn't help past the bottleneck. Profile to find what serialises; either remove the bottleneck (shard the hot resource) or scale the bottleneck. Generic capacity addition without finding the bottleneck always disappoints.

---

## Related topics

- [Scalability](scalability.md) — broader scaling concepts
- [Queuing Theory & Little's Law](queuing-theory.md) — pairs with USL for capacity planning
- [Concurrency & Locking](concurrency.md) — sources of contention
- [Sharding](../patterns/sharding.md) — reducing coordination via partitioning
- [Hot Partitions & Hotspots](hot-partitions.md) — where coordination concentrates
