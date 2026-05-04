# Quorum

## What it is

A quorum is the minimum number of nodes that must agree on an operation for it to be considered valid. Quorum is the mechanism that lets distributed systems configure their own trade-off between consistency and availability — you pick the numbers, you pick the trade-off.

The core formula: **R + W > N**

```
N = total number of replicas
W = number of replicas that must acknowledge a write (write quorum)
R = number of replicas that must acknowledge a read (read quorum)

If R + W > N → at least one node is in BOTH the read set and the write set
             → that node has the most recent write
             → reads always see the latest write → strong consistency
```

---

## Why it works: the overlap guarantee

```
N = 3 replicas (nodes A, B, C)
W = 2  (write must be acknowledged by 2 nodes)
R = 2  (read must consult 2 nodes)

R + W = 4 > N = 3 → overlap guaranteed

Write goes to: A, B  (W=2)
Read consults: B, C  (R=2)

Overlap: node B is in both sets
B has the latest write → read returns correct value

Even if A is down:
  Write goes to: B, C  (still W=2 ✓)
  Read consults: B, C  (still R=2 ✓)
  System remains available despite A being offline
```

---

## Configuring consistency vs availability

By adjusting R, W, and N you get different trade-offs:

```
N=3 replicas. What can we set?

Strong consistency (read-your-writes):
  W=2, R=2  → R+W=4 > 3 ✓
  2 nodes must ack write, 2 must respond to read
  Tolerates 1 node failure

High availability (eventual consistency):
  W=1, R=1  → R+W=2 ≤ 3 ✗ (no overlap guarantee)
  Very fast, always available, but may return stale data

Write-heavy (fast writes, slower reads):
  W=1, R=3  → R+W=4 > 3 ✓
  Writes fast (only 1 node), reads must contact all 3
  
Read-heavy (fast reads, slower writes):
  W=3, R=1  → R+W=4 > 3 ✓
  All 3 nodes must ack every write (slow), but reads only need 1 node
  High durability (survives any 2 failures for reads)

All writes to all nodes (W=N):
  W=3, R=1  → strongest durability, write latency = slowest node
```

**Visualization:**

```
W=1, R=1 (eventual):           W=2, R=2 (strong):
  Write → [A][ ][ ]               Write → [A][B][ ]
  Read  → [ ][ ][C]               Read  → [ ][B][C]
  No overlap → stale possible      Overlap at B → always fresh

W=3, R=1 (all-write):          W=1, R=3 (all-read):
  Write → [A][B][C]               Write → [A][ ][ ]
  Read  → [A][ ][ ]               Read  → [A][B][C]
  Always fresh, slow writes        Fast writes, slow reads
```

---

## Quorum in practice: Cassandra (tunable consistency)

Cassandra lets you set the consistency level per-query:

```python
from cassandra.cluster import Cluster
from cassandra.policies import ConsistencyLevel

cluster = Cluster(['cassandra1', 'cassandra2', 'cassandra3'])
session = cluster.connect('my_keyspace')

# Strong read (quorum = majority must respond)
session.default_consistency_level = ConsistencyLevel.QUORUM  # R = N/2+1

# For a 3-node cluster: QUORUM = 2
row = session.execute("SELECT * FROM users WHERE id = %s", [user_id])

# Fast write (only 1 node must ack — eventual consistency)
session.default_consistency_level = ConsistencyLevel.ONE
session.execute("INSERT INTO events (...) VALUES (...)")

# Strongest: all nodes must respond
session.default_consistency_level = ConsistencyLevel.ALL
```

**Cassandra consistency levels:**

| Level | Meaning | R+W>N? |
|---|---|---|
| `ONE` | 1 replica responds | No (eventual) |
| `TWO` | 2 replicas respond | Depends on N |
| `QUORUM` | N/2+1 replicas respond | Yes (strong) |
| `ALL` | All N replicas respond | Yes (strongest) |
| `LOCAL_QUORUM` | Quorum within local DC only | Yes (within DC) |
| `EACH_QUORUM` | Quorum in every DC | Yes (global) |

**Common production pattern:**

```python
# Writes: ONE (fast, high availability)
# Reads: QUORUM (strong consistency where it matters)

# This gives:
#   W=1, R=2 (N=3) → R+W=3 = N (boundary case)
# Not strictly quorum — some staleness possible.

# For true strong consistency:
#   Writes: QUORUM, Reads: QUORUM
#   W=2, R=2, N=3 → R+W=4 > 3 ✓
```

---

## Quorum in Raft / consensus

Raft (and Paxos) use quorum majority for every decision:

```
5-node Raft cluster (N=5):
Quorum = N/2 + 1 = 3

To commit a log entry:
  Leader sends entry to all 5 nodes
  Needs acknowledgment from 3 (quorum)
  Can tolerate 2 failures and still make progress

To elect a leader:
  Candidate needs votes from 3 nodes
  Can tolerate 2 non-voters

Safety guarantee:
  Any two quorums of 3 overlap by at least 1 node
  → That node has seen the latest committed entry
  → No stale leader can be elected without seeing the latest log
```

---

## Read repair

Even with quorum reads, different replicas may return different versions (one lagged). The client (or coordinator) compares and writes the latest value back to the stale replica:

```python
class QuorumCoordinator:
    def read(self, key: str) -> bytes:
        # Contact R replicas
        responses = self.contact_replicas(key, count=self.R)
        
        # Find the most recent value (by timestamp or version)
        latest = max(responses, key=lambda r: r.timestamp)
        
        # Repair stale replicas asynchronously
        stale = [r for r in responses if r.timestamp < latest.timestamp]
        for replica in stale:
            asyncio.create_task(replica.write(key, latest.value, latest.timestamp))
        
        return latest.value
```

---

## Sloppy quorum and hinted handoff

In Dynamo-style systems (Cassandra, DynamoDB), if enough replicas for a key are unavailable, the write is accepted by a "nearby" node temporarily — **sloppy quorum**:

```
Key belongs to nodes [A, B, C] (N=3)
B and C are down

Sloppy quorum:
  Write goes to A (normal) + D (temporary "hint" holder)
  D stores a hint: "this write belongs to B, deliver when B is back"

When B recovers:
  D sends the hinted write to B (hinted handoff)
  System converges to consistent state
```

**Trade-off:** Sloppy quorum improves availability but weakens consistency — the hint holder is outside the true replica set.

---

## Quorum trade-offs summary

| Configuration | Consistency | Write speed | Read speed | Failure tolerance |
|---|---|---|---|---|
| W=1, R=1 | Eventual | Fastest | Fastest | Can still serve with any 1 node |
| W=N/2+1, R=N/2+1 | Strong | Medium | Medium | Tolerates N/2 failures |
| W=N, R=1 | Strongest write | Slowest | Fastest | Reads survive N-1 failures |
| W=1, R=N | Eventual write | Fastest | Slowest | Writes survive N-1 failures |

**The fundamental rule:** you're always trading latency and availability against consistency. Higher quorum = more consistency = higher latency = lower availability.

---

## Interview talking points

!!! tip "Key things to say"
    1. R + W > N is the formula — if the sum exceeds N, there's guaranteed overlap between read and write sets
    2. Cassandra's QUORUM consistency level is the practical embodiment of this — N/2+1 nodes must respond
    3. Quorum tolerates N/2 failures (for majority quorum) — a 5-node cluster survives 2 node failures
    4. Read repair keeps replicas in sync without blocking the read — stale replicas catch up asynchronously
    5. Sloppy quorum (Dynamo/Cassandra) trades consistency for availability: write to a nearby node as a proxy when replicas are down

## Related topics

- [Consensus (Raft & Paxos)](consensus.md) — Raft uses quorum majority for every log commit
- [Replication](../patterns/replication.md) — quorum determines how many replicas must ack
- [CAP Theorem](../fundamentals/cap-theorem.md) — quorum is the mechanism that implements CP vs AP
- [Consistency Models](../fundamentals/consistency-models.md) — quorum level determines which consistency model you get
