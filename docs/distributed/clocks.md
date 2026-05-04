# Clocks & Ordering

## The problem with physical clocks

In distributed systems, you can't trust physical (wall) clocks:

```
Node A: time = 10:00:00.100
Node B: time = 10:00:00.095  ← 5ms behind due to clock drift

Event on A at 10:00:00.100
Event on B at 10:00:00.095

By timestamp: B's event appears to happen BEFORE A's
Reality: A's event happened first

NTP synchronizes to ~1-100ms accuracy in LANs
  → events within 100ms window: ordering is unknown
```

Physical clocks drift and can't be relied on for ordering in distributed systems. You need **logical clocks**.

## Lamport Clocks

A logical clock that establishes causal ordering. Designed by Leslie Lamport (1978).

### Rules

1. Each process maintains a counter, initially 0
2. Before sending a message: increment counter
3. On receiving a message: `counter = max(local_counter, received_counter) + 1`
4. For any event: increment counter before the event

```python
class LamportClock:
    def __init__(self):
        self.counter = 0
    
    def increment(self) -> int:
        self.counter += 1
        return self.counter
    
    def update(self, received: int):
        self.counter = max(self.counter, received) + 1
```

### Example

```
Process A: clock=0
Process B: clock=0
Process C: clock=0

A: local event → A.clock=1  ("send message 1")
A→B: send message, timestamp=1
B: receives, B.clock = max(0, 1)+1 = 2
B: local event → B.clock=3
B→C: send message, timestamp=3
C: receives, C.clock = max(0, 3)+1 = 4

If clock(e1) < clock(e2), then e1 happened before e2 (causally)
But: clock(e1) = clock(e2) → can't determine order (concurrent events)
```

**Limitation:** If `clock(A) < clock(B)`, A might have caused B — but you can't be sure. Lamport clocks detect causality but produce false positives (unrelated events may appear ordered).

## Vector Clocks

Track causality per process. A vector where each entry represents a process's clock.

```python
class VectorClock:
    def __init__(self, node_id: str, all_nodes: List[str]):
        self.node_id = node_id
        self.clock = {node: 0 for node in all_nodes}
    
    def increment(self):
        self.clock[self.node_id] += 1
    
    def update(self, received: dict):
        for node, ts in received.items():
            self.clock[node] = max(self.clock[node], ts)
        self.clock[self.node_id] += 1
    
    def happens_before(self, other_clock: dict) -> bool:
        """Does self happen before other?"""
        return (all(self.clock[n] <= other_clock[n] for n in self.clock) and
                any(self.clock[n] < other_clock[n] for n in self.clock))
    
    def concurrent_with(self, other_clock: dict) -> bool:
        """Are self and other concurrent (no causal relationship)?"""
        return (not self.happens_before(other_clock) and
                not VectorClock.static_happens_before(other_clock, self.clock))
```

### Example

```
3 nodes: A, B, C
Initial: A=[0,0,0], B=[0,0,0], C=[0,0,0]

A sends event e1: A=[1,0,0]
A→B: message with [1,0,0]
B receives: B=[1,1,0] (took max of each + increment own)
B sends event e2: B=[1,2,0]
B→C: message with [1,2,0]
C receives: C=[1,2,1]

Analysis:
  e1 ([1,0,0]) < e2 ([1,2,0])? All entries ≤ and some <: YES → e1 happened before e2

Concurrent events (no causal relationship):
  A: [2,0,0]  (A did something after e1)
  B: [0,1,0]  (B did something without hearing from A)
  [2,0,0] < [0,1,0]? No. [0,1,0] < [2,0,0]? No.
  → Concurrent → conflict → application must resolve
```

**Used by:** Amazon DynamoDB (version vectors), Cassandra (timestamps + LWW), Riak (vector clocks for conflict detection)

## Hybrid Logical Clocks (HLC)

Combines physical time and logical time: monotonic, stays close to wall clock, captures causality.

```
HLC = (physical_time, logical_counter)

Rules:
  l' = max(l, wall_clock)
  If l' > l: c' = 0
  Else: c' = c + 1

On receiving message with (l_recv, c_recv):
  l' = max(l, l_recv, wall_clock)
  If l' = l = l_recv: c' = max(c, c_recv) + 1
  Else if l' = l: c' = c + 1
  Else if l' = l_recv: c' = c_recv + 1
  Else: c' = 0
```

**Benefits:**
- Timestamps are close to real time (useful for queries like "all events after 2024-04-26 14:00")
- Captures causality (like Lamport/vector clocks)
- Monotonically increasing (no backwards time jumps)

**Used by:** CockroachDB, YugabyteDB

## Google Spanner TrueTime

Spanner solves the distributed ordering problem with hardware: GPS receivers and atomic clocks in every data center.

```
TrueTime API:
  TT.now() returns: (earliest_time, latest_time)
  
  Uncertainty interval: typically 1-7 milliseconds
  
  TT.after(t): true if t has definitely passed
  TT.before(t): true if t has definitely not passed
```

**How Spanner uses it for external consistency:**

```
Write transaction:
  1. Propose timestamp T = TT.now().latest
  2. Wait until TT.after(T)  ← wait out the uncertainty interval
  3. Commit with timestamp T

This guarantees:
  Any transaction committed before this write has timestamp < T
  → Real-time ordering preserved across all data centers globally
```

The "commit wait" adds ~7ms latency per transaction — but provides external consistency (linearizability) across a globally distributed system. No other distributed DB does this without specialized hardware.

## Ordering in practical systems

### Event ordering in Kafka

Within a partition: strict ordering (append-only log)  
Across partitions: no ordering guarantee — use single partition or include timestamp + consumer-side merge

### Timestamp-based conflict resolution

Most systems use wall-clock timestamps with Last-Write-Wins (LWW):

```
DynamoDB (default): LWW with server-assigned timestamps
Cassandra (default): LWW with client-provided timestamps
  → Risk: clock skew causes overwrites

Better: client-provided Lamport timestamps or version numbers
```

### Causal consistency in practice

DynamoDB offers causal consistency within a session via transaction tokens:

```python
# Token tracks the causal past of this session
token = dynamodb.transact_write(items=[...])['ResponseMetadata']['CausalityToken']

# Read respects causality — will see the write above
dynamodb.get_item(Key={...}, CausalityToken=token)
```

## Interview angle

!!! tip "What interviewers are testing"
    Ordering questions come up with: "how do you ensure events are processed in order?" or "how do you detect conflicts in a distributed system?"

**Key points:**
1. Physical clocks lie — don't use for distributed ordering
2. Lamport clocks: if clock(A) < clock(B), A might have caused B — but not guaranteed
3. Vector clocks: precise causality detection, identify concurrent events
4. In Kafka: partition key ensures ordering within a partition (per user/entity)
5. In practice: LWW with timestamps is common despite clock skew risk — acknowledge this

## Related topics

- [Consistency Models](../fundamentals/consistency-models.md) — causal consistency requires clock/ordering
- [Consensus (Raft & Paxos)](consensus.md) — uses logical clocks internally
- [Replication](../patterns/replication.md) — conflict resolution in leaderless systems
- [Event Streaming](../messaging/event-streaming.md) — Kafka partition ordering
