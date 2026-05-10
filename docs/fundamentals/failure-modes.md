# Failure Modes Catalogue

Production systems don't fail like "off." They fail in subtle, partial, lying ways: half-broken, slow-but-not-dead, working for some users but not others. Recognising the taxonomy of failure modes is the difference between debugging and guessing.

---

## The taxonomy

```
Failure ──┬── Crash failure        (process dies, clean stop)
          ├── Omission failure     (drops messages, silent loss)
          ├── Timing failure       (responds too slowly)
          ├── Performance failure  (works but degraded)
          ├── Byzantine failure    (lies, sends bad data)
          └── Gray failure         (fails differently to different observers)
```

Each requires a different detection and mitigation strategy.

---

## 1. Crash (fail-stop)

The simplest failure: process or machine stops responding entirely.

```
Before: server returns 200 OK
After:  TCP connection refused / timeout
```

Detection: health checks (TCP, HTTP, application-level), absence of heartbeats.

Easy to handle: fail over to replicas, drain traffic, restart.

This is the failure model most algorithms (Raft, basic consensus) assume — it's the easiest case.

---

## 2. Omission

Process is running but drops messages. Could be:

- Network packet loss
- Buffer overflow on the receiver
- Bug in the application that silently drops events
- Queue back-pressure causing producer to discard

```
Producer sends 1000 events
Consumer receives 950
50 events disappeared with no error
```

Detection: end-to-end counters, sequence numbers, audit reconciliation.

Hard to detect because there's no signal — the messages just aren't there. This is why audit logs and reconciliation jobs exist: catch what monitoring missed.

---

## 3. Timing

Process responds, but too slowly. Often the worst kind in distributed systems.

```
Healthy: 50 ms response
Sick:    5000 ms response   (alive but unhelpful)
```

Effects:

- Caller's timeouts trigger → caller assumes failure
- Threads pile up waiting → caller may exhaust resources
- Cascading slowdown — dependents of the slow service slow too

This is why **circuit breakers** exist: detect slow + failing dependencies and stop calling them.

Detection: latency metrics (P50, P95, P99); alert on sustained increases.

---

## 4. Performance degradation

A subset of timing failure: the system works but at lower capacity.

```
Normal: 10K requests/sec
Degraded: 2K requests/sec, but still serves correct responses
```

Causes:

- Garbage collection pauses
- Disk getting full
- Some replicas down (others overloaded)
- Hot partition
- Network congestion

Often invisible to liveness checks but very visible to users (queue grows, latency rises).

---

## 5. Byzantine

A node sends incorrect or malicious data. Possibilities:

- Hardware fault (cosmic ray flips a bit)
- Software bug computing wrong answer
- Compromised node (attacker)
- Misconfiguration

```
T1 reads from node A → "balance: 100"
T1 reads from node B → "balance: 100"
T2 reads from node C → "balance: 1000000"   ← lying
```

Most production systems assume Byzantine failures don't happen — they're rare in trusted environments. Blockchains and BFT consensus exist for environments where they do.

Detection: cross-checking, checksums, signed messages, voting/quorum.

---

## 6. Gray failure

The most insidious. The system fails *differently* to different observers:

```
External health check from monitoring: ✓ healthy
Internal health check from peers: ✓ healthy
Actual user requests: ✗ failing
```

Causes:

- Health check is too simple (TCP open ≠ working)
- Loss affects only some traffic patterns (specific endpoints, large requests)
- Thread pool exhausted but main thread responsive
- Disk full only for write operations
- DNS broken inside but not outside

Famous examples:

- **Azure Storage 2018 outage**: storage was "healthy" by internal metrics; user requests timed out
- **AWS S3 2017**: small subset of nodes returned errors; load balancer kept routing to them

Detection requires:

- Health checks that exercise real code paths
- Synthetic monitoring from outside
- Multiple observation perspectives (peer, client, monitoring)
- Rate-of-error tracking, not just liveness

The fix is often *to detect more reliably*: better health checks, better metrics, multiple-perspective monitoring.

---

## Half-failures

Many real failures are partial:

### Network partition

Some nodes can talk to each other; some can't. Subgroups think they're the majority.

```
Datacenter East: nodes 1, 2, 3
Datacenter West: nodes 4, 5

Network partition:
  East side thinks West is dead → promotes new leader
  West side thinks East is dead → promotes new leader
  
Both sides accept writes → split brain
```

See [CAP Theorem](cap-theorem.md) and [Split Brain & Fencing](../distributed/split-brain.md).

### Slow disk

Disk is dying — random reads work, sequential reads stall. Process is alive but database operations hang.

### Memory pressure

OOM killer hasn't fired yet; process is paging heavily. Throughput drops 10×; healthchecks barely respond.

### File descriptor exhaustion

Process can't open new connections but existing ones work. Looks healthy to old connections; broken to new.

---

## Failure correlation

Independent failures are easy. Correlated failures are catastrophic:

```
Single replica fails: handled (others take over)
All replicas fail simultaneously: outage

Causes of correlation:
  - Same software bug deployed everywhere
  - Same physical rack / DC
  - Same operating system update
  - Same configuration change
  - DNS or shared service failure
  - Power, cooling, network at the facility level
```

Mitigations:

- Deploy across availability zones / regions
- Stagger deploys
- Diversity in dependencies (avoid single-vendor lock-in for critical paths)
- Regular failover drills

The Netflix Chaos Monkey philosophy: regularly cause failures to ensure systems handle them.

---

## Cascading failure

One failure triggers more, until the system collapses.

```
Service A's downstream Service B becomes slow
  → Service A's threads pile up waiting
  → Service A exhausts thread pool
  → Service A stops accepting new requests
  → Service A's caller (Service C) sees A as down
  → Service C's threads pile up
  → Cascade continues upstream
```

Mitigations:

- **Timeouts** on every downstream call
- **Circuit breakers** to stop calling failing dependencies
- **Bulkhead** patterns (separate thread pools per dependency)
- **Backpressure** all the way up
- **Load shedding** at the edge — drop requests rather than queue indefinitely

See [Circuit Breaker](../patterns/circuit-breaker.md), [Bulkhead](../patterns/bulkhead.md), [Backoff Strategies](../patterns/backoff.md).

---

## The thundering herd

Many clients retry simultaneously after a brief outage:

```
12:00:00 - service is briefly unavailable
12:00:01 - 1M clients all retry simultaneously
12:00:01 - service is overwhelmed by retry storm
12:00:02 - service crashes from load
12:00:03 - clients retry again
```

Mitigations:

- **Exponential backoff with jitter** — retries spread over time
- **Token bucket / rate limiting** at the server
- **Client-side circuit breakers**
- **Graceful degradation** — return cached / partial responses

---

## Memory leaks and slow growth

A failure mode that takes hours or days to manifest:

```
Day 1: 2 GB RAM used, normal latency
Day 3: 10 GB RAM used, slight latency increase
Day 5: 28 GB RAM used, GC thrashing
Day 7: OOM killer terminates process
```

Detection: long-term RAM trends, GC time/frequency, periodic restarts as a band-aid.

Solutions: heap profiling, memory leak detection (Valgrind, jemalloc, language-specific tools).

---

## Time and clock failures

```
Server's clock drifts 30 seconds ahead
TLS certificates "expire" (because clock is ahead)
Logs show events out of order
JWT tokens fail validation
Distributed lock timeouts behave erratically
```

Detection:

- NTP sync monitoring
- Cross-server time skew alarms
- Avoid relying on wall-clock time for logic — use monotonic clocks where possible

See [Clocks & Ordering](../distributed/clocks.md).

---

## Configuration failures

```
Engineer pushes new config:
  database_pool_size: 5     ← was 100, typo
Service starts, can't handle load
Cascading failure across cluster
```

Often more catastrophic than code bugs because:

- Bypass code review for config changes
- Apply immediately to all instances
- Hard to roll back (which value was the old one?)

Mitigations: config in version control, reviewed like code, gradual rollout, validate before applying.

---

## Detection vs prevention vs recovery

For each failure mode, three layers:

| Layer | Goal |
|---|---|
| **Prevention** | Don't let it happen (testing, validation, redundancy) |
| **Detection** | Know it's happening (monitoring, alerts, audits) |
| **Recovery** | Restore service (auto-failover, runbooks, rollbacks) |

Mature systems have all three. Immature systems lean on one (usually detection — alerts) and pay for the other two.

---

## Designing for failure

```
1. Assume every dependency will fail
   - Timeouts, retries, circuit breakers, fallbacks

2. Limit blast radius
   - Bulkheads, cell architecture, regional isolation

3. Make recovery automatic
   - Auto-restart, auto-failover, self-healing

4. Make state recoverable
   - Backups, replicas, snapshots, audit logs

5. Test failure modes regularly
   - Chaos engineering, game days, runbook drills

6. Monitor for the silent ones
   - Audit reconciliation, end-to-end counters
   - Synthetic monitoring from real user perspectives
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you've operated systems where failures were partial and lying, not just clean.

**Strong answer pattern:**
1. Failures aren't binary; gray failure and partial outages are most common
2. Detection requires multiple perspectives (peer, client, synthetic)
3. Cascading failure is the dominant outage pattern in microservices
4. Defenses: timeouts, circuit breakers, bulkheads, backpressure, jitter
5. Test for failures — chaos engineering, game days

**Common follow-up:** *"What's gray failure and why does it matter?"*
> When a system fails differently to different observers — healthy from monitoring's perspective but broken to users. Caused by health checks that don't exercise real paths, partial loss affecting specific traffic, or shared resources where one path is broken. The danger is that automated systems trust the health signal and don't fail over. Mitigation: health checks that touch real code paths, synthetic monitoring from real user perspective, error-rate alerting that doesn't depend on liveness.

---

## Related topics

- [Fault Tolerance & Resilience](fault-tolerance.md) — handling these failures
- [Distributed: 8 Fallacies](../distributed/fallacies.md) — assumptions that produce failures
- [Circuit Breaker](../patterns/circuit-breaker.md) — guard against timing failures
- [Split Brain & Fencing](../distributed/split-brain.md) — partition-induced failures
- [Incident Management](../observability/incident-management.md) — handling failures when they hit
