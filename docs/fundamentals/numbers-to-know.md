# Numbers Every Engineer Should Know

These numbers — originally popularized by Jeff Dean at Google — give you a fast mental model for back-of-envelope calculations and tradeoff reasoning. Memorize the order of magnitude, not the exact figure.

---

## Latency numbers (2024 reference)

| Operation | Latency | Relative |
|---|---|---|
| L1 cache reference | 0.5 ns | 1× |
| Branch misprediction | 5 ns | 10× |
| L2 cache reference | 7 ns | 14× |
| Mutex lock/unlock | 25 ns | |
| Main memory (RAM) reference | 100 ns | 200× |
| Compress 1KB with Snappy | 3 μs | |
| **Redis / memcached read** | **~0.5 ms** | |
| Send 1KB over 1Gbps network (same AZ) | 10 μs | |
| SSD random read (NVMe) | 100–200 μs | |
| **Database read (same AZ, indexed)** | **1–5 ms** | |
| Read 1MB sequentially from SSD | 1 ms | |
| Round trip within same datacenter | 0.5 ms | |
| **Round trip: client → CDN edge** | **5–20 ms** | |
| HDD disk seek | 10 ms | 20,000× RAM |
| Read 1MB sequentially from HDD | 20 ms | |
| **Round trip: same region, different AZ** | **1–5 ms** | |
| Round trip: US East → US West | 40 ms | |
| Round trip: US → Europe | 80 ms | |
| Round trip: US → Asia | 150 ms | |
| TLS handshake (1.3) | 1 × RTT | |
| DNS lookup (cold) | 50–100 ms | |

```
RAM:       0.1 μs    (nanoseconds)
SSD:         0.1 ms  (100× RAM)
HDD:          10 ms  (100× SSD)
Network:   0.5–150ms (depends on distance)
```

---

## Storage sizes

| Unit | Size | Example |
|---|---|---|
| 1 KB | 1,000 bytes | Short text document |
| 1 MB | 10⁶ bytes | 1-minute MP3 audio, small photo |
| 1 GB | 10⁹ bytes | HD movie, 1000 photos |
| 1 TB | 10¹² bytes | 1000 HD movies |
| 1 PB | 10¹⁵ bytes | Large data warehouse |

**Common object sizes (approximate):**

| Object | Size |
|---|---|
| UUID / GUID | 36 bytes (string), 16 bytes (binary) |
| SHA-256 hash | 32 bytes |
| Typical JSON API response | 1–5 KB |
| Profile photo (thumbnail) | 10–50 KB |
| Full-res photo | 2–8 MB |
| 1 min audio (MP3 128kbps) | ~1 MB |
| 1 min video (720p H.264) | ~50 MB |
| 1 min video (1080p H.264) | ~150 MB |

---

## Throughput benchmarks

| System | Throughput (approximate) |
|---|---|
| Single Redis instance | 100,000–1,000,000 ops/sec |
| PostgreSQL (OLTP, indexed) | 10,000–50,000 QPS |
| MySQL (read replicas) | 50,000–100,000 reads/sec |
| Kafka partition | 10–50 MB/s write throughput |
| Kafka cluster (3 brokers) | 1–10 GB/s |
| Nginx (static files) | 100,000+ req/s per server |
| Node.js (typical CRUD) | 5,000–20,000 req/s |
| Python/Django (WSGI) | 500–2,000 req/s |
| 1Gbps NIC | 125 MB/s = 1,000 MB/s theoretical |
| 10Gbps NIC | 1,250 MB/s |

These are **order-of-magnitude** benchmarks. Real numbers depend heavily on query complexity, hardware, and configuration.

---

## Availability & time

| Availability | Downtime / year | Downtime / month | Downtime / week |
|---|---|---|---|
| 99% (2 nines) | 87.6 hours | 7.2 hours | 1.68 hours |
| 99.9% (3 nines) | 8.76 hours | 43.8 min | 10.1 min |
| 99.99% (4 nines) | 52.6 min | 4.38 min | 1.01 min |
| 99.999% (5 nines) | 5.26 min | 26 sec | 6 sec |

---

## Useful multipliers

```
1 million  = 10⁶
1 billion  = 10⁹
1 trillion = 10¹²

Seconds per day:    86,400 ≈ 100,000
Seconds per month:  2,592,000 ≈ 2.5 million
Seconds per year:   31,536,000 ≈ 31.5 million

1 million req/day  ÷ 86,400 = ~12 req/sec
10 million req/day            = ~116 req/sec
100 million req/day           = ~1,160 req/sec (≈ 1.2k QPS)
1 billion req/day             = ~11,600 req/sec (≈ 12k QPS)
```

**Peak-to-average ratio:** Traffic is never uniform. Assume peak = 2–3× average for web traffic.

---

## Powers of 2 (for storage estimates)

| Power | Exact | Approximate | Human |
|---|---|---|---|
| 2¹⁰ | 1,024 | ~1 thousand | 1 KB |
| 2²⁰ | 1,048,576 | ~1 million | 1 MB |
| 2³⁰ | 1,073,741,824 | ~1 billion | 1 GB |
| 2⁴⁰ | ~1 trillion | 1 TB |
| 2⁵⁰ | ~1 quadrillion | 1 PB |

---

## Practical estimation rules

### QPS → storage

```
Users per day × avg requests per user = total daily requests
÷ 86,400 = average QPS
× 2-3 = peak QPS

Storage per day = QPS × avg_object_size × seconds_per_day
```

### Bandwidth

```
Bandwidth = QPS × avg_response_size

Example: 10,000 QPS, 5KB average response
  = 50 MB/s = 400 Mbps
  → Need at least 1 Gbps NIC (with 60% headroom)
```

### Cache sizing

```
Cache 20% of objects → get 80% of the cache benefit (Pareto principle)

Daily active data = total data × hot data ratio (typically 5–20%)
Cache budget = hot data × average object size
```

---

## Interview cheat sheet

When you hear a scale figure in an interview, immediately convert:

| Stated scale | What it means |
|---|---|
| "1M users" | If each makes 10 req/day: ~115 QPS average |
| "100M users" | ~11,574 QPS average, ~30k QPS peak |
| "Twitter scale" | ~500M tweets/day = ~6,000 writes/sec |
| "YouTube scale" | ~500 hours of video uploaded per minute |
| "500ms SLA" | Database + network + app logic must fit in 500ms |

**Quick sanity checks:**
- Is the data size within RAM? (Redis/memcached feasible)
- Is the QPS within single DB range? (<10k: yes, >50k: need read replicas)
- Does bandwidth fit a 10Gbps link? (125 MB/s)

---

## Related topics

- [Back-of-Envelope Estimation](estimation.md) — structured estimation framework
- [Latency vs Throughput](latency-throughput.md) — tradeoffs in system performance
- [Scalability](scalability.md) — when numbers force architectural changes
- [Caching Strategies](../caching/caching-strategies.md) — turning latency numbers into design decisions
