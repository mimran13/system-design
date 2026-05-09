# Queuing Theory & Little's Law

Queuing theory gives you the math to reason about wait times, capacity, and throughput in any system with requests and servers. It explains why a system at 80% utilization feels fine but at 95% feels broken — and why adding one server at the right moment can halve your latency.

---

## Little's Law

The most important formula in system design:

> **L = λ × W**

| Variable | Meaning |
|---|---|
| **L** | Average number of requests in the system (queue + being served) |
| **λ** (lambda) | Arrival rate (requests per second) |
| **W** | Average time a request spends in the system (wait + service time) |

This law holds for **any stable system** regardless of arrival distribution, service time distribution, or number of servers.

### Examples

**Example 1: Web server**
```
λ = 1,000 req/s
W = 50ms average response time

L = 1,000 × 0.05 = 50 requests in flight at any moment

If W spikes to 500ms:
L = 1,000 × 0.5 = 500 requests in flight → need to hold 500 open connections
```

**Example 2: Database connection pool**
```
λ = 500 queries/s
W = 20ms average query time

L = 500 × 0.02 = 10 connections needed on average

Pool should be sized > 10 with headroom for spikes (e.g., 20-30 connections)
```

**Example 3: Sizing a queue**
```
Processing rate: 100 jobs/sec
Max acceptable wait: 5 seconds
Expected arrival rate: 80 jobs/sec (below processing rate — queue is stable)

If bursts hit 200 jobs/sec for 10 seconds:
  Backlog = (200 - 100) × 10 = 1,000 jobs queued
  Time to drain: 1,000 / (100 - 80) = 50 seconds to drain at steady state
```

---

## Utilization and why 100% is a cliff

**Utilization ρ = λ / μ**

- λ = arrival rate
- μ (mu) = service rate (maximum throughput)
- ρ < 1 for a stable queue (ρ ≥ 1 means queue grows without bound)

The relationship between utilization and latency is **non-linear**:

```
Utilization    Wait time (relative to service time)
    50%         1×    (barely any wait)
    70%         2.3×
    80%         4×
    90%         9×
    95%         19×
    99%         99×
   100%         ∞     (queue grows forever)
```

```
Latency
  ∞ |                                         ●
    |                                    ●
    |                               ●
    |                          ●
    |                    ●
    |           ●
    |    ●
    |___________________________________
    0   20%  40%  60%  80%  90% 95% 100%
                                     Utilization
```

**Practical implication:** Target 60-70% utilization for latency-sensitive systems. Running at 90% feels economical but any traffic spike pushes you into exponential latency growth.

---

## M/M/1 Queue

The simplest queueing model: single server, Poisson arrivals, exponential service times.

```
Arrival rate: λ (Poisson distributed)
Service rate: μ (exponential distribution)
Servers:      1
```

Key formulas:

```
Utilization:          ρ = λ/μ
Avg queue length:     Lq = ρ² / (1 - ρ)
Avg wait in queue:    Wq = ρ / (μ - λ)
Avg system length:    L = ρ / (1 - ρ)
Avg system time:      W = 1 / (μ - λ)
```

**Example:**
```
λ = 8 req/s, μ = 10 req/s, ρ = 0.8

Avg queue length:  Lq = 0.8² / (1 - 0.8) = 0.64 / 0.2 = 3.2 requests waiting
Avg wait in queue: Wq = 0.8 / (10 - 8) = 0.4s
Avg system time:   W  = 1 / (10 - 8)   = 0.5s

Double the service rate to μ=20:
  ρ = 0.4
  W = 1 / (20 - 8) = 0.083s  ← 6× improvement from 2× service rate
```

---

## M/M/c Queue (multiple servers)

More realistic — c parallel servers, single shared queue.

```
λ = 80 req/s, μ = 50 req/s per server

With 2 servers: ρ = 80 / (2×50) = 0.8   → manageable
With 1 server:  ρ = 80 / 50     = 1.6   → unstable (queue grows forever)
```

**Key insight:** Adding a second server doesn't just double capacity — it also dramatically reduces wait time by providing backup capacity during bursts.

This is why **horizontal scaling reduces tail latency**: even at the same average utilization, multiple servers reduce queueing variance.

---

## Response time percentiles

Average latency is misleading. A small fraction of slow requests can dominate user experience.

```
100 requests: 99 complete in 10ms, 1 completes in 5000ms
  Average: ~60ms  (looks fine)
  P99:     5000ms (terrible for 1 in 100 users)
```

**Why tail latencies are high:**
- Long GC pauses
- Thread pool exhaustion (request waited in queue)
- Cold cache on the unlucky request
- Resource contention at high utilization

**Fan-out amplifies tail latency:**
```
Service calls 10 downstream services in parallel.
Each has P99 = 100ms.
P(at least one > 100ms) = 1 - (0.99)^10 = ~10%

Your P90 is the downstream P99.
```

This is why microservices must have aggressive timeouts and circuit breakers — tail latency compounds.

---

## Applying queuing theory to system design

### Capacity planning

```
Target: P99 < 200ms, expected load 500 QPS

Step 1: Measure single-server service time
  DB query: 10ms avg, 40ms P99

Step 2: Target utilization
  For P99 budget: target ρ < 0.7 to keep queue waits small

Step 3: Calculate required capacity
  At ρ = 0.7 with service rate μ:
    λ = ρ × μ → μ = λ/ρ = 500/0.7 = 714 QPS capacity needed

Step 4: Size the fleet
  Each server handles ~100 QPS comfortably → need 8 servers
  (714 / 100 = 7.14, round up + headroom)
```

### Queue depth as a health signal

```python
# Queue depth growing = system falling behind
metrics.gauge("worker.queue_depth", queue.size())
metrics.gauge("worker.utilization", active_workers / total_workers)

# Alert: queue depth > 1000 AND growing
# Scale out: utilization > 70% for 5 minutes
```

A growing queue is always a sign of λ > μ — arrival faster than processing. Either reduce λ (rate limit, shed load) or increase μ (scale out, optimize).

### Backpressure

When a downstream component is overwhelmed (queue full, ρ → 1), it must signal upstream to slow down.

```
Without backpressure:
  Client → overloaded service → requests pile up → OOM → crash

With backpressure:
  Client → overloaded service → HTTP 429 / TCP window shrink → client slows down
```

See [Backpressure](../messaging/backpressure.md) for patterns.

---

## Thread pools and the Bulkhead

Every thread pool is a queue + c servers. Little's Law applies:

```
Thread pool: 20 threads, avg task time 100ms
  Maximum throughput: μ = 20 / 0.1 = 200 tasks/sec
  At λ = 180 tasks/sec: ρ = 0.9 → high latency, large queue

What happens when λ > 200?
  Queue fills up → tasks rejected → RejectedExecutionException
  Or queue unbounded → memory exhausted → crash
```

**Size thread pools for your P99 service time, not your mean:**
```
Pool threads needed = λ × W_P99
  λ = 50 req/s, W_P99 = 500ms
  threads = 50 × 0.5 = 25 threads (minimum for P99 cases)
  Add headroom: 30-40 threads
```

---

## Summary: rules of thumb

```
1. Target 60-70% utilization for latency-sensitive services
   90% utilization → 9× latency amplification under load

2. L = λW applies everywhere
   Know your arrival rate and service time → predict concurrency needs

3. Fan-out multiplies tail latency
   10 parallel calls: your P90 is roughly their P99

4. A growing queue means λ > μ
   Either reduce load or increase processing capacity

5. Adding a server reduces variance, not just mean
   Two servers at 40% each beats one server at 80%

6. Measure P99, not average
   Average hides the 1-in-100 terrible experience
```

---

## Interview angle

!!! tip "Queuing theory in system design"
    - *"Why are you running at only 70% CPU?"* → Queuing theory: at 90% utilization, queue wait time grows exponentially. 70% gives burst headroom without latency degradation.
    - *"How do you size your connection pool?"* → Little's Law: L = λ × W. If 500 queries/sec with 20ms avg = 10 connections needed average; size to 2-3× for variance.
    - *"Why does adding one more server sometimes dramatically improve latency?"* → It reduces utilization below the knee of the curve — from 90% (9× wait) to 80% (4× wait) is a 2× improvement in queue wait.
    - *"What happens to a system under flash traffic?"* → ρ spikes above 1 → queue grows unbounded → latency climbs → timeouts fire → retries make it worse → cascading failure. Solution: rate limiting, shedding, autoscaling.

## Related topics

- [Latency vs Throughput](latency-throughput.md) — utilization vs latency trade-offs
- [Back-of-Envelope Estimation](estimation.md) — capacity planning in interviews
- [Patterns: Backpressure](../messaging/backpressure.md) — signaling overload upstream
- [Patterns: Rate Limiting](../patterns/rate-limiting.md) — capping λ to protect μ
- [Patterns: Bulkhead](../patterns/bulkhead.md) — isolating thread pools to contain overload
- [Scalability](scalability.md) — horizontal scaling changes μ
