# Split Brain & Fencing

Split brain is one of the most dangerous failure modes in distributed systems: two nodes both believe they are the authoritative leader, both accept writes, and the system produces inconsistent data. Understanding split brain — and fencing tokens as the solution — is essential for any distributed system design.

---

## What is split brain?

Split brain occurs when a network partition causes a cluster's nodes to separate into groups that can no longer communicate, and more than one group elects a new leader.

```
Normal operation (1 leader):
  ┌──────────────────────────────────┐
  │  Node A (Leader)  Node B  Node C │
  │  ←──── all connected ────────→  │
  └──────────────────────────────────┘

Network partition:
  ┌─────────────────┐     ┌─────────────────┐
  │  Node A (Leader)│  ✗  │  Node B  Node C │
  │  "I'm alive!"   │     │  "A is dead,     │
  └─────────────────┘     │   elect B!"      │
                          └─────────────────┘

Result:
  Node A: still accepts writes (thinks it's leader)
  Node B: elected as new leader, accepts writes
  → Two authoritative nodes → divergent data → split brain
```

---

## Why quorum alone isn't enough

A naive fix: "the leader needs a quorum to stay leader." But what if a leader loses quorum, considers itself a follower, and the old lease hasn't expired yet?

```
Scenario (3 nodes, quorum = 2):
  t=0: A is leader, holds lease until t=30
  t=5: Network partition — A isolated, B+C form majority
  t=6: B+C elect B as new leader (have quorum)
  t=7: A's lease expires... in 23 more seconds
  t=7 to t=30: A still considers itself leader, accepts writes
               B also considers itself leader, accepts writes
  → Both writing for 23 seconds → divergence
```

The window between "old leader lost quorum" and "old leader's lease expires" is the split-brain danger zone. It's finite, but real writes happen during it.

---

## Fencing tokens

A fencing token is a monotonically increasing number given to a new leader on each election. Any resource (lock, storage, service) the leader interacts with **rejects requests with a stale token**.

```
Leader election:
  Round 1: Node A elected leader → token = 100
  Round 2: Node B elected leader → token = 101  (after A lost quorum)

Node A (zombie, old leader):
  Sends write request with token = 100

Storage service:
  "Latest token I've seen is 101. 100 < 101 → REJECT"

Node A's write is safely blocked, even though A thinks it's leader
```

```python
class FencedStorage:
    def __init__(self):
        self.current_fence_token = 0
        self.data = {}

    def write(self, key: str, value: any, fence_token: int) -> bool:
        if fence_token < self.current_fence_token:
            raise StaleLeaderError(
                f"Token {fence_token} is stale. Current: {self.current_fence_token}"
            )
        # Accept the write and update the token
        self.current_fence_token = fence_token
        self.data[key] = value
        return True

    def read(self, key: str) -> any:
        return self.data.get(key)


class LeaderElection:
    def __init__(self, zookeeper):
        self.zk = zookeeper
        self.fence_token = 0

    def acquire_leadership(self) -> int:
        # ZooKeeper's ephemeral sequential node gives a monotonic number
        self.fence_token = self.zk.create_ephemeral_sequential("/leader/node-")
        return self.fence_token  # clients pass this with every write
```

### Fencing in ZooKeeper

ZooKeeper's sequential ephemeral nodes naturally provide fencing tokens:

```
Node A creates /lock/node-0000000100  → gets token 100
Node A crashes, node expires
Node B creates /lock/node-0000000101  → gets token 101

Node A revives (zombie):
  Tries to write to the protected resource with token 100
  Resource: "I've seen token 101, reject 100"
  Node A's writes fail → no split brain damage
```

### Fencing with Redis (Redlock)

Redis's Redlock algorithm is controversial because Redis doesn't provide fencing tokens. Martin Kleppmann's critique:

```
Problem with Redlock:
  1. Client A acquires lock, gets expiry time T
  2. Client A pauses for GC longer than T
  3. Lock expires, Client B acquires same lock
  4. Client A wakes up, still thinks it holds the lock
  5. Both A and B proceed with the "locked" operation

Without fencing tokens, there's no way for the resource
to detect that A's lock is stale.

Fix: resource must check a fencing token, not just assume lock is valid
```

---

## Real-world split brain examples

### MySQL Primary-Primary replication

```
Master A ←→ Master B (both configured as primary)
Network partition for 30 seconds:
  A accepts 1,000 writes
  B accepts 1,000 writes (different)
  Partition heals: conflicting data on same primary keys
  → Data loss or corruption on merge
```

**Solution:** Use Paxos/Raft-based clustering (MySQL Group Replication, Galera with quorum), or always have only one writable primary.

### Elasticsearch split brain (pre-7.0)

```
7-node cluster, minimum_master_nodes = 3 (majority of 5 eligible)

Network partition: cluster splits 4-3
  4-node side: has quorum → elects master
  3-node side: was configured with old value → also elects master

Result: two clusters, diverged indices
Pre-7.0 Elasticsearch suffered this due to misconfiguration
Post-7.0: discovery.type=single-node or voting config eliminates it
```

### Kubernetes ETCD split brain

ETCD uses Raft consensus — a 5-node cluster requires 3 nodes for quorum. If a partition splits it 2-3, the 2-node side becomes read-only (cannot commit writes without quorum). No split brain — but reduced availability.

```
5-node ETCD cluster, partition: 3|2
  3-node side: quorum = 3 ≥ 3 → still writable
  2-node side: quorum = 2 < 3 → read-only
  → No split brain, 2-node side degrades to read-only
```

---

## Detecting and preventing split brain

### Quorum-based prevention

Only allow writes if the node has acknowledgment from a majority:

```python
class RaftNode:
    def write(self, value):
        # Attempt to replicate to followers
        acks = self.replicate_to_followers(value)
        
        if acks + 1 < self.quorum:  # +1 for self
            # Don't have quorum — step down
            self.step_down_as_leader()
            raise QuorumLostError("Cannot commit: lost quorum")
        
        # Commit only if we have majority
        self.commit(value)
```

### Lease-based prevention

Leader leases with intentional early expiry:

```
Lease duration: 10 seconds
Leader renews every: 5 seconds (before expiry)

If leader can't renew (lost quorum):
  → Stops accepting writes BEFORE lease expires
  → Safe gap before a new leader can be elected

New leader's clock-skew buffer:
  Wait max_clock_skew before accepting writes
  → Guarantees old leader has stopped
```

### STONITH (Shoot The Other Node In The Head)

Force the suspected zombie node offline before proceeding:

```
Node B suspects Node A is dead:
  Before electing itself leader:
  → STONITH: send "power off" signal to Node A's IPMI/iDRAC
  → Wait for confirmation
  → Only then accept writes

If STONITH fails: don't proceed (safer than split brain)
```

Used in Pacemaker/Corosync HA clusters, VMware HA.

---

## Split brain in practice: what actually happens

```
Scenario: Payment service with two active primaries

Timeline:
  t=0:  Primary A processes payment P-001: charge $100
  t=0:  Primary B (split brain) processes payment P-001: charge $100
  t=60: Partition heals
  t=61: Replication conflict detected: P-001 processed twice
  
Impact:
  Customer charged twice
  Database has conflicting rows
  Manual reconciliation required
  
How to detect after the fact:
  Monotonic sequence numbers per node
  Conflict detection on merge (CRDTs help here)
  Audit logs with node IDs and timestamps
```

---

## Summary

| Mechanism | Prevents | Limitation |
|---|---|---|
| **Quorum** | Prevents minority from becoming leader | Doesn't prevent zombie leader damage |
| **Fencing tokens** | Prevents zombie writes from landing | Requires resource cooperation |
| **Leases with buffer** | Reduces split-brain window | Clock skew can still be a problem |
| **STONITH** | Actively kills zombie | Requires out-of-band management |
| **Raft/Paxos consensus** | Prevents election without majority | Reduces availability during partitions |

The full solution is usually: **Raft/Paxos for election + fencing tokens for resource protection + STONITH if available**.

---

## Interview angle

!!! tip "Split brain in system design"
    - *"How do you prevent two primaries from writing at the same time?"* → Raft consensus for election (majority required), fencing tokens on the storage layer. Resource rejects any request with a token older than the latest it's seen.
    - *"What happens when a network partition heals in a system with two primaries?"* → Diverged data. One primary must be rolled back. Fencing tokens would have prevented writes from the zombie — so if fencing is in place, one side had zero writes and merge is trivial.
    - *"Why is Redlock controversial?"* → No fencing tokens — a GC-paused client can wake up after the lock expired and another client acquired it, with no way for the resource to detect the stale lock.

## Related topics

- [Leader Election](leader-election.md) — the election that can produce split brain
- [Distributed Locks](distributed-locks.md) — fencing in lock implementations
- [Consensus (Raft & Paxos)](consensus.md) — how consensus prevents split brain at the election level
- [Failure Detection](failure-detection.md) — distinguishing a dead node from a slow one
- [Quorum](quorum.md) — majority-based protection
