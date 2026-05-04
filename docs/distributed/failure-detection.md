# Failure Detection

## What it is

Failure detection determines whether a node in a distributed system has crashed or is unreachable. It's fundamental to replication, leader election, load balancing, and circuit breaking. The challenge: due to the network's asynchrony, you can't distinguish "node crashed" from "node is slow."

## The fundamental impossibility

In an asynchronous network with no timing guarantees:

```
Node A sends heartbeat to Node B
No response for 5 seconds

Is B dead? Or just slow?

You cannot know for certain.
All failure detectors make probabilistic judgments.
```

**FLP Impossibility Result:** In an asynchronous network, no consensus algorithm can guarantee both safety and liveness. All failure detectors make a tradeoff.

## Simple heartbeat

The most basic approach: nodes send periodic heartbeats. If no heartbeat within a timeout, assume failed.

```python
class HeartbeatDetector:
    def __init__(self, timeout_seconds: float = 10):
        self.last_heartbeat = {}
        self.timeout = timeout_seconds
    
    def heartbeat_received(self, node_id: str):
        self.last_heartbeat[node_id] = time.time()
    
    def is_alive(self, node_id: str) -> bool:
        last = self.last_heartbeat.get(node_id)
        if last is None:
            return False
        return time.time() - last < self.timeout
    
    def get_dead_nodes(self) -> List[str]:
        return [n for n, t in self.last_heartbeat.items() 
                if time.time() - t >= self.timeout]
```

**Parameters:**
- **Heartbeat interval:** How often nodes send heartbeats (1-10 seconds)
- **Timeout:** How long to wait before declaring dead (3-5x heartbeat interval)

**Trade-off:**
- Short timeout: detect failures fast → false positives (network hiccup = false death)
- Long timeout: fewer false positives → slow failure detection

## Phi Accrual Failure Detector (Cassandra)

Instead of binary alive/dead, outputs a continuous value φ (phi) representing the "suspicion level." The application chooses the threshold.

```
φ = 0: definitely alive
φ = 5: probably alive (1 in 200 chance it's up)
φ = 10: probably dead (1 in 22,000 chance it's up)

In Cassandra: threshold=8 → treat as dead if φ ≥ 8
```

**How φ is computed:**

```python
import math
from collections import deque

class PhiAccrualDetector:
    def __init__(self, window_size: int = 1000, threshold: float = 8.0):
        self.window = deque(maxlen=window_size)
        self.last_heartbeat = None
        self.threshold = threshold
    
    def heartbeat(self):
        now = time.time()
        if self.last_heartbeat is not None:
            interval = now - self.last_heartbeat
            self.window.append(interval)
        self.last_heartbeat = now
    
    def phi(self) -> float:
        """Current suspicion level"""
        if not self.window or self.last_heartbeat is None:
            return 0
        
        elapsed = time.time() - self.last_heartbeat
        mean = sum(self.window) / len(self.window)
        
        # Assume normal distribution of heartbeat intervals
        variance = sum((x - mean) ** 2 for x in self.window) / len(self.window)
        std_dev = math.sqrt(variance) if variance > 0 else 1
        
        # CDF of normal distribution
        y = (elapsed - mean) / std_dev
        p = 1 - (1 / (1 + math.exp(-1.7 * y)))  # logistic approximation
        
        return -math.log10(max(p, 1e-100))
    
    def is_available(self) -> bool:
        return self.phi() < self.threshold
```

**Benefits:**
- Adapts to network conditions (high-variance networks → higher threshold needed)
- Gradual suspicion — not binary flip from alive to dead
- Configurable threshold per use case

## SWIM (Scalable Weakly-consistent Infection-style Membership)

Used by: Consul, HashiCorp Serf, Kubernetes cluster membership.

SWIM combines failure detection and membership dissemination in a single protocol using gossip.

### Direct probing

Every T seconds, each node picks a random member and sends a ping:
```
A → B: PING
B → A: ACK (within timeout)

If no ACK → indirect probe
```

### Indirect probing (avoids false positives from A-B link failures)

```
A → B: no ACK
A → C, D, E: "ping B on my behalf"
C → B: PING
B → C: ACK
C → A: "B responded"

B is alive (just A→B link was temporarily broken)
```

If indirect probes also fail → B is suspected. Suspicion propagated via gossip.

### Suspicion mechanism

Rather than immediately declaring B dead, mark as "suspect" and start a timer:
```
B suspected: A gossips "B:suspect:incarnation=5"
B receives suspicion: refutes by gossipping "B:alive:incarnation=6"
If refutation arrives before timer: suspicion withdrawn
If timer expires without refutation: B declared dead, removed from membership
```

**Incarnation numbers:** Allow nodes to refute false suspicions. Monotonically increasing. Higher number wins.

## Failure detector properties

### Completeness

**Strong completeness:** Every crashed process is eventually suspected by every correct process.  
**Weak completeness:** Every crashed process is eventually suspected by some correct process.

All practical failure detectors achieve completeness — crashed nodes will be detected.

### Accuracy

**Strong accuracy:** No correct process is ever suspected.  
**Weak accuracy:** Some correct process is never suspected.  
**Eventually strong accuracy:** After some time, no correct process is suspected (false positives stop).

In practice: weak accuracy is acceptable — occasional false suspicions are ok as long as they resolve.

### Safety vs liveness

**Too aggressive** (low timeout): False positives → healthy nodes removed from service → reduced capacity.  
**Too conservative** (high timeout): Slow failure detection → traffic sent to dead nodes → errors.

## Network partition detection

Failure detection can't distinguish partition from failure:

```
Network splits: {A, B} | {C, D}
A → C: no response → A suspects C (false positive!)
C → A: no response → C suspects A (false positive!)

Both sides declare the other dead
Both elect leaders
Split-brain!
```

Solutions:
- Quorum: require majority agreement to remove a node (prevents lone partitioned node from removing others)
- Fencing: use fencing tokens to prevent old leader from acting
- Human intervention for prolonged partitions

## AWS context

| Service | Failure detection mechanism |
|---|---|
| ALB | HTTP health checks every 30s. 3 consecutive failures → remove from target group |
| Route 53 | HTTP/TCP/HTTPS health checks. Failover routing |
| ECS | Task health checks, auto-replace unhealthy tasks |
| RDS Multi-AZ | Synchronous replication heartbeat. ~30s failover on primary failure |
| ElastiCache | Redis cluster node health via gossip-like mechanism |

## Interview angle

!!! tip "When failure detection comes up"
    Usually in "what happens when a node crashes?" or "how do you handle partial failures?"

**Strong answer pattern:**
1. Heartbeats are the basic mechanism — tune interval and timeout for your SLO
2. Phi accrual gives you a probabilistic confidence level — better than binary
3. SWIM for large-scale cluster membership — used in Kubernetes/Consul
4. Distinguish failure from partition — you can't, so use quorum + fencing
5. ALB health checks are your practical answer for AWS workloads

## Related topics

- [Availability & Reliability](../fundamentals/availability.md) — why detection speed matters
- [Leader Election](leader-election.md) — failure detection triggers re-election
- [Gossip Protocol](gossip.md) — SWIM uses gossip for propagation
- [Circuit Breaker](../patterns/circuit-breaker.md) — application-level failure detection
