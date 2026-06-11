---
tags:
  - interview-critical
---

# Back-of-Envelope Estimation

## What it is

Back-of-envelope estimation is the skill of producing rough but usable numbers quickly — without a calculator, without precise data. It's used to size systems, validate design choices, and spot bottlenecks before you build.

In interviews, it signals engineering maturity: you know what scale you're dealing with before picking your tools.

## Powers of 2 — memorize these

```
2^10 =   1,024           ≈ 1 thousand    (KB)
2^20 =   1,048,576       ≈ 1 million     (MB)
2^30 =   1,073,741,824   ≈ 1 billion     (GB)
2^40 =                   ≈ 1 trillion    (TB)
```

## Time conversions — memorize these

```
1 day    = 86,400 seconds  ≈ 100,000 (10^5)
1 month  = 2.5 million seconds
1 year   = 31.5 million seconds ≈ 3 × 10^7
```

## Data size estimates

| Item | Approximate size |
|---|---|
| ASCII character | 1 byte |
| Unicode character (UTF-8) | 1–4 bytes |
| Integer (32-bit) | 4 bytes |
| Long / Double (64-bit) | 8 bytes |
| UUID | 16 bytes |
| Short string (username) | 32 bytes |
| Medium string (URL, email) | 256 bytes |
| Tweet / short post | 280 bytes |
| Typical DB row | 1 KB |
| Thumbnail image | 100 KB |
| Profile photo (compressed) | 300 KB |
| HD photo | 3 MB |
| 1-min audio (MP3) | 1 MB |
| 1-min video (720p) | 50 MB |
| 1-min video (1080p) | 150 MB |

## QPS estimation formula

```
QPS = Daily Active Users × Actions per user per day / Seconds per day
    = DAU × actions / 86,400
```

**Example: Twitter-like system**
```
DAU: 300 million
Average tweets per user per day: 0.1 (most users read, few write)
Average reads per user per day: 100 (timeline, search, notifications)

Write QPS = 300M × 0.1 / 86,400 = 347 writes/sec ≈ 350 QPS
Read QPS  = 300M × 100 / 86,400 = 347,000 reads/sec ≈ 350K QPS
Read:Write ratio ≈ 1000:1
```

## Storage estimation formula

```
Storage = QPS × Average object size × Seconds per day × Retention days
```

**Example: photo storage**
```
Write QPS: 1,000 photos/sec
Average photo size: 300 KB
Retention: 5 years = 5 × 365 = 1825 days

Daily storage:    1,000 × 300 KB × 86,400 = 25.92 TB/day
5-year storage:   25.92 TB × 1825 = 47,304 TB ≈ 47 PB
```

## Bandwidth estimation formula

```
Bandwidth = QPS × Average payload size
```

**Example:**
```
Read QPS: 10,000 req/sec
Average response size: 10 KB

Bandwidth = 10,000 × 10 KB = 100 MB/sec = 800 Mbps
A 10 Gbps network link can handle this.
```

## Memory (cache) estimation

```
Cache memory = Hot data fraction × Total working set size

If 20% of data serves 80% of requests (Pareto principle):
Cache size = 20% × daily storage
```

**Example:**
```
Daily storage: 100 GB new data
Working set (30 days): 3 TB
Hot 20%: 600 GB

→ Need ~600 GB of RAM across cache nodes
→ With Redis using ~1-2 bytes overhead per byte stored: ~1.2 TB allocated
```

## Worked example: URL Shortener

```
Requirements:
- 100 million new URLs per day
- 10:1 read:write ratio
- 5-year data retention

QPS:
  Write QPS = 100M / 86,400     ≈ 1,160 writes/sec ≈ 1.2K QPS
  Read QPS  = 1,160 × 10       ≈ 12,000 reads/sec ≈ 12K QPS

Storage:
  Per URL record: short_code (7 bytes) + long_url (256 bytes) + metadata ≈ 500 bytes
  Daily: 100M × 500 bytes = 50 GB/day
  5 years: 50 GB × 365 × 5 = 91.25 TB ≈ 100 TB

Memory (cache):
  Working set: 100 TB × 20% hot = 20 TB → too large to cache entirely
  Daily hot URLs: 50 GB × 20% = 10 GB/day → cache today's hot URLs in ~10 GB RAM

Network:
  Read: 12,000 req/sec × 500 bytes = 6 MB/sec = 48 Mbps (trivial)
```

## Common estimation gotchas

**Don't forget replication:** Storage × 3 (3 replicas) is the actual disk provisioned.

**Peak vs average:** Systems must handle peak load, not average. Assume 2x–10x peak multiplier depending on traffic patterns.

**Don't over-precise:** 1.16K QPS → say "~1K QPS". Accuracy within 10x is usually sufficient.

**Read vs write ratio matters:** A 1000:1 read-heavy system and a 1:1 read-write system need very different architectures.

## Interview angle

!!! tip "What interviewers are testing"
    They want to see structured thinking and order-of-magnitude accuracy — not Excel precision.

**Strong answer pattern:**
1. State your assumptions out loud (DAU, usage frequency, data sizes)
2. Derive QPS from DAU × actions / seconds
3. Derive storage from QPS × size × retention
4. State the read:write ratio — this drives the architecture choice
5. Use round numbers — 1.16K → "about 1K"

**Estimation → decision chain example:**
```
12K read QPS, 1.2K write QPS
→ Read-heavy → add caching + read replicas
→ 100 TB storage → DynamoDB or Cassandra (not single-node SQL)
→ 10 GB hot cache → fits comfortably in ElastiCache cluster
```

## Test yourself

Answers are hidden — commit to an answer before expanding.

??? question "Why does the read:write ratio matter more than the raw QPS number for your architecture?"

    Because it drives the architecture choice: a 1000:1 read-heavy system and a 1:1 read-write system need very different designs. Read-heavy points you at caching and read replicas; write-heavy pushes you toward different storage choices entirely. That's why a strong estimation answer always states the ratio explicitly — see the Twitter example above, where reads outnumber writes ~1000:1.

??? question "Why is cache size typically estimated as roughly 20% of the working set?"

    Because of the Pareto principle: roughly 20% of the data serves 80% of the requests, so caching that hot 20% captures most of the benefit. You apply it as `cache size = 20% × working set` — e.g. a 3 TB 30-day working set needs ~600 GB of cache RAM. Remember Redis overhead (~1-2 bytes per byte stored) when sizing the actual allocation.

??? question "You're designing a URL shortener taking 100 million new URLs per day with a 10:1 read:write ratio — what QPS do you plan for?"

    Write QPS = 100M / 86,400 ≈ 1,160 ≈ 1.2K writes/sec, and reads at 10× that ≈ 12K reads/sec. The useful shortcut is seconds per day ≈ 100,000, so 100M/day is roughly 1K/sec. The 10:1 read-heavy ratio then tells you to add caching and read replicas.

??? question "You estimated 100 TB of storage for 5 years, but the provisioned disks are filling about 3× faster than planned — what did you forget?"

    Replication. The 100 TB is logical data size; with 3 replicas the actual disk provisioned is storage × 3 ≈ 300 TB. This is one of the listed estimation gotchas, alongside sizing for average instead of peak load (assume a 2x-10x peak multiplier).

??? question "An interviewer asks you to size storage for a photo service: 1,000 photo uploads/sec at ~300 KB each, retained 5 years. Walk it through."

    Daily storage = 1,000 × 300 KB × 86,400 ≈ 26 TB/day. Over 5 years (~1,825 days) that's roughly 47,000 TB ≈ 47 PB. State the assumptions out loud, round aggressively (accuracy within 10× is sufficient), and note this rules out single-node storage — you're in object-store territory, and ×3 if you count replication.

## Related topics

- [Scalability](scalability.md) — what to do once you know your numbers
- [CAP Theorem](cap-theorem.md) — how scale forces consistency tradeoffs
- [Latency vs Throughput](latency-throughput.md) — the latency numbers that inform estimates
