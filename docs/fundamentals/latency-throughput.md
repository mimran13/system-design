# Latency vs Throughput

## Definitions

**Latency** — the time it takes to complete a single operation. "How long does one request take?"

**Throughput** — the number of operations completed per unit time. "How many requests can the system handle per second?"

**Bandwidth** — the maximum theoretical throughput of a channel (network, disk, CPU).

## Why they're often at odds

Batching increases throughput but increases latency:

```
No batching:
  Request 1 → processed immediately → response in 5ms
  Throughput: 200 req/s (limited by per-request overhead)

Batching (wait 50ms, process 100 together):
  Request 1 → waits 50ms for batch → processed → response in 55ms
  Throughput: 2,000 req/s (100x improvement)
```

Replication increases availability but increases write latency:

```
Write to 1 node:  5ms latency,  high throughput
Write to 3 nodes: 15ms latency, lower throughput (synchronous quorum)
```

## Latency numbers every engineer should know

```
Operation                          Latency
─────────────────────────────────────────
L1 cache reference                 0.5 ns
Branch misprediction               5 ns
L2 cache reference                 7 ns
Mutex lock/unlock                  25 ns
Main memory reference              100 ns
Compress 1K bytes with Snappy      3,000 ns    (3 μs)
Send 1K bytes over 1 Gbps network  10,000 ns   (10 μs)
Read 4K from SSD                   150,000 ns  (150 μs)
Read 1 MB sequentially from memory 250,000 ns  (250 μs)
Round trip in same datacenter      500,000 ns  (0.5 ms)
Read 1 MB sequentially from SSD    1,000,000 ns (1 ms)
Disk seek                          10,000,000 ns (10 ms)
Read 1 MB from network             10,000,000 ns (10 ms)
Cross-continent round trip         150,000,000 ns (150 ms)
```

**Key takeaways:**
- Memory is ~1000x faster than disk
- SSD is ~100x faster than HDD
- Same-DC network is ~500μs — cheap for internal calls
- Cross-continent is 150ms — avoid in synchronous hot paths

## Percentiles — why averages lie

Average latency hides the worst user experiences.

```
10 requests with latencies: [1, 1, 1, 1, 1, 1, 1, 1, 1, 100] ms

Mean = 10.9 ms  (misleading — most users see 1ms)
P50  = 1 ms     (median user)
P95  = 100 ms   (1 in 20 users)
P99  = 100 ms   (1 in 100 users)
P999 = 100 ms   (1 in 1000 users)
```

**At scale, tail latency matters:**
- At 1,000 req/s: P99 affects 10 users/sec
- A single page that makes 10 parallel backend calls has the latency of the **slowest** call — so P99 of each backend becomes P90 of the overall page

**Measure and alert on P95 and P99, not mean.**

## Little's Law

```
L = λ × W

L = average number of requests in the system
λ = average arrival rate (requests/sec)
W = average time in system (latency)
```

**Practical use:** If your system processes 1,000 req/s and each request takes 100ms, there are 100 requests in-flight at any time. This tells you how many concurrent connections, threads, or goroutines you need.

```
Connection pool size = QPS × latency
= 1,000 req/s × 0.1 sec = 100 concurrent connections needed
```

## Throughput limits

**CPU-bound:** Computation is the bottleneck. Scale by adding cores/nodes.

**IO-bound:** Waiting on disk/network. Scale by:
- Async I/O (don't block threads on I/O)
- More connections / higher parallelism
- Caching to eliminate I/O

**Memory-bound:** Data doesn't fit in cache, causing frequent misses. Scale by:
- Larger instances
- Smarter caching / data locality

## Optimizing latency

| Technique | Where it helps |
|---|---|
| Caching | Eliminate repeated expensive reads |
| Connection pooling | Avoid connection setup overhead |
| Async I/O | Don't block threads waiting for disk/network |
| CDN / Edge caching | Reduce geographic distance |
| Compression | Reduce payload size on network |
| HTTP/2 multiplexing | Eliminate head-of-line blocking |
| Read replicas | Offload reads to nearby replica |
| Denormalization | Eliminate joins in hot read paths |

## Optimizing throughput

| Technique | Where it helps |
|---|---|
| Batching | Amortize per-request overhead |
| Pipelining | Overlap requests in flight |
| Horizontal scaling | Add more workers |
| Async processing | Queue work, process independently |
| Sharding | Parallelize across partitions |
| Vectorized operations | Process many items in one CPU instruction |

## The bandwidth-latency product

```
BDP = Bandwidth × Round-trip latency

Example: 1 Gbps link, 100ms round trip
BDP = 1,000,000,000 bits/sec × 0.1 sec = 100,000,000 bits = ~12 MB

This is how much data can be "in flight" at once.
To saturate the link, you need a window this large.
```

This matters for TCP window sizing and large file transfers over high-latency links.

## AWS context

| Service | Latency characteristics |
|---|---|
| DynamoDB (DAX) | Single-digit milliseconds → microseconds with DAX |
| ElastiCache | Sub-millisecond |
| RDS (same AZ) | ~1-5ms query latency |
| S3 (first byte) | 100-200ms |
| Lambda (warm) | <1ms overhead |
| Lambda (cold start) | 100ms–3s depending on runtime |
| CloudFront → Origin | Adds ~1-5ms vs direct (cached eliminates origin entirely) |

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you make tradeoffs consciously — not blindly optimize one at the expense of the other.

**Strong answer pattern:**
1. Know the latency requirement for the system (SLO)
2. Identify if it's latency-sensitive (payments, real-time) or throughput-sensitive (batch, analytics)
3. Explain your tradeoff when batching or replicating
4. Use percentile language — P99 rather than average

**Common follow-up:** *"How would you reduce P99 latency in your system?"*
> Profile to find the tail — is it a slow DB query? A downstream service? Garbage collection pauses? Then: add caching, move the call async, add a timeout + fallback, or shard the hot data.

## Related topics

- [Scalability](scalability.md) — throughput at scale
- [Caching](../caching/index.md) — primary latency optimization tool
- [Load Balancing](../networking/load-balancing.md) — distributing to reduce per-server load
- [SLI, SLO & SLA](../observability/slo-sla.md) — how latency targets are formalized
