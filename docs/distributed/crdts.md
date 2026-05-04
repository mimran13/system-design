# CRDTs (Conflict-free Replicated Data Types)

## What it is

A CRDT is a data structure that can be replicated across multiple nodes, updated independently and concurrently, and merged automatically without conflicts. Any two replicas that have received the same set of updates will be in the same state — regardless of the order or timing of those updates.

CRDTs solve the fundamental problem of **concurrent writes in distributed systems**: how do you let multiple nodes write to shared data without coordination, and have them converge to a consistent state?

```
Without CRDT (requires coordination):
  Node A: counter = 5
  Node B: counter = 5  (replica)
  
  A increments: counter = 6  (concurrently)
  B increments: counter = 6  (concurrently)
  
  Merge → conflict: which 6 is correct? Is it 6 (one increment) or 7 (two increments)?
  Can't resolve without a lock or consensus.

With G-Counter CRDT:
  A: {A:3, B:2}  (A's view: A did 3 increments, B did 2)
  B: {A:2, B:3}  (B's view: A did 2 increments, B did 3)
  
  Merge: {A: max(3,2), B: max(2,3)} = {A:3, B:3}
  Value: 3 + 3 = 6  ✓  (two increments, one on each node)
  No conflict — merge is automatic and correct.
```

---

## Why CRDTs work: the math

CRDTs are grounded in **join-semilattice** theory. A valid CRDT must satisfy:

```
1. Commutativity:  merge(A, B) = merge(B, A)
   (order of merge doesn't matter)

2. Associativity:  merge(merge(A, B), C) = merge(A, merge(B, C))
   (grouping of merges doesn't matter)

3. Idempotency:    merge(A, A) = A
   (merging the same state twice = same result as merging once)

These three properties mean: deliver updates in any order, any number of times,
and the final state is always the same.
```

There are two families:
- **CvRDT (Convergent)** — state-based: merge full state
- **CmRDT (Commutative)** — operation-based: replicate operations

---

## Type 1: G-Counter (Grow-only Counter)

A counter that can only be incremented. Each node tracks its own count; the total is the sum.

```python
class GCounter:
    def __init__(self, node_id: str, all_nodes: list[str]):
        self.node_id = node_id
        self.counts: dict[str, int] = {node: 0 for node in all_nodes}
    
    def increment(self):
        self.counts[self.node_id] += 1
    
    def value(self) -> int:
        return sum(self.counts.values())
    
    def merge(self, other: 'GCounter') -> 'GCounter':
        """Merge by taking max of each node's count."""
        merged = GCounter(self.node_id, list(self.counts.keys()))
        for node in self.counts:
            merged.counts[node] = max(
                self.counts.get(node, 0),
                other.counts.get(node, 0)
            )
        return merged

# Example:
node_a = GCounter('A', ['A', 'B'])
node_b = GCounter('B', ['A', 'B'])

node_a.increment()  # A counts: {A:1, B:0}
node_a.increment()  # A counts: {A:2, B:0}
node_b.increment()  # B counts: {A:0, B:1}

# Network partition heals — nodes exchange state
merged = node_a.merge(node_b)
print(merged.counts)  # {A:2, B:1}
print(merged.value()) # 3  ← correct! A did 2, B did 1
```

---

## Type 2: PN-Counter (Positive-Negative Counter)

A counter that supports both increment and decrement, using two G-Counters:

```python
class PNCounter:
    def __init__(self, node_id: str, all_nodes: list[str]):
        self.node_id = node_id
        self.positive = GCounter(node_id, all_nodes)  # increments
        self.negative = GCounter(node_id, all_nodes)  # decrements
    
    def increment(self): self.positive.increment()
    def decrement(self): self.negative.increment()
    
    def value(self) -> int:
        return self.positive.value() - self.negative.value()
    
    def merge(self, other: 'PNCounter') -> 'PNCounter':
        merged = PNCounter(self.node_id, list(self.positive.counts.keys()))
        merged.positive = self.positive.merge(other.positive)
        merged.negative = self.negative.merge(other.negative)
        return merged

# Use case: inventory count, like/dislike counts, vote counts
```

---

## Type 3: G-Set (Grow-only Set)

A set that supports only add, never remove:

```python
class GSet:
    def __init__(self):
        self.items: set = set()
    
    def add(self, item): self.items.add(item)
    def contains(self, item) -> bool: return item in self.items
    def value(self) -> set: return self.items.copy()
    
    def merge(self, other: 'GSet') -> 'GSet':
        merged = GSet()
        merged.items = self.items | other.items  # union
        return merged
```

---

## Type 4: 2P-Set (Two-Phase Set)

Supports add and remove, but once removed, an item can never be re-added:

```python
class TwoPhaseSet:
    def __init__(self):
        self.added = GSet()
        self.removed = GSet()
    
    def add(self, item):
        if item not in self.removed.items:
            self.added.add(item)
    
    def remove(self, item):
        if item in self.added.items:
            self.removed.add(item)
    
    def contains(self, item) -> bool:
        return item in self.added.items and item not in self.removed.items
    
    def value(self) -> set:
        return self.added.items - self.removed.items
    
    def merge(self, other: 'TwoPhaseSet') -> 'TwoPhaseSet':
        merged = TwoPhaseSet()
        merged.added = self.added.merge(other.added)
        merged.removed = self.removed.merge(other.removed)
        return merged
```

---

## Type 5: LWW-Element-Set (Last-Write-Wins Set)

Supports add/remove with timestamps. The latest timestamp wins for each element:

```python
import time

class LWWSet:
    def __init__(self):
        self.add_map: dict[str, float] = {}     # item → timestamp of last add
        self.remove_map: dict[str, float] = {}  # item → timestamp of last remove
    
    def add(self, item: str):
        self.add_map[item] = time.time()
    
    def remove(self, item: str):
        self.remove_map[item] = time.time()
    
    def contains(self, item: str) -> bool:
        add_ts = self.add_map.get(item, 0)
        remove_ts = self.remove_map.get(item, 0)
        return add_ts > remove_ts  # most recent operation wins
    
    def merge(self, other: 'LWWSet') -> 'LWWSet':
        merged = LWWSet()
        for item in set(self.add_map) | set(other.add_map):
            merged.add_map[item] = max(
                self.add_map.get(item, 0),
                other.add_map.get(item, 0)
            )
        for item in set(self.remove_map) | set(other.remove_map):
            merged.remove_map[item] = max(
                self.remove_map.get(item, 0),
                other.remove_map.get(item, 0)
            )
        return merged
```

**LWW risk:** relies on clock synchronization. If clocks are skewed, a stale write can win. Use vector clocks for safety.

---

## Type 6: OR-Set (Observed-Remove Set)

The most practical set CRDT — supports add and remove, and re-add after remove:

```python
import uuid

class ORSet:
    """
    Each element is tagged with a unique token on add.
    Remove removes all current tokens for that element.
    Add after remove creates a new token → element is present again.
    """
    def __init__(self):
        # {item → set of unique tokens}
        self.entries: dict[str, set[str]] = {}
        self.tombstones: dict[str, set[str]] = {}  # removed tokens
    
    def add(self, item: str):
        token = str(uuid.uuid4())
        if item not in self.entries:
            self.entries[item] = set()
        self.entries[item].add(token)
    
    def remove(self, item: str):
        # Move all current tokens to tombstones
        if item in self.entries:
            if item not in self.tombstones:
                self.tombstones[item] = set()
            self.tombstones[item] |= self.entries[item]
            self.entries[item] = set()
    
    def contains(self, item: str) -> bool:
        active_tokens = self.entries.get(item, set()) - self.tombstones.get(item, set())
        return len(active_tokens) > 0
    
    def merge(self, other: 'ORSet') -> 'ORSet':
        merged = ORSet()
        all_items = set(self.entries) | set(other.entries)
        for item in all_items:
            merged.entries[item] = (
                self.entries.get(item, set()) |
                other.entries.get(item, set())
            )
            merged.tombstones[item] = (
                self.tombstones.get(item, set()) |
                other.tombstones.get(item, set())
            )
        return merged
```

---

## Where CRDTs are used in production

```
Redis:
  redis.crdt module (Redis Enterprise)
  Multi-master geo-distributed Redis using CRDTs
  Counters, sets, sorted sets all CRDT-backed
  Concurrent writes from multiple regions → automatic convergence

Riak:
  Pioneered CRDT use in databases
  Riak Data Types: counters, sets, maps, flags, registers
  Used by Riot Games (player data), Comcast (user data)

Cassandra:
  Counters are CRDT-like (not strictly pure but inspired by G-Counter)
  Lightweight transactions use Paxos, not CRDTs

Collaborative editing (Google Docs, Figma, Notion):
  Text editing = sequence CRDT (RGA, LSEQ, Logoot)
  Multiple users editing simultaneously → CRDT merges changes
  Without CRDT: need Operational Transformation (OT), much more complex

SoundCloud (real-time features):
  Social graph operations using CRDTs for offline-first mobile

Shopping cart (Amazon Dynamo paper):
  Add-to-cart uses set CRDT
  Items added on two devices during offline → both items present on merge
```

---

## CRDTs vs other conflict resolution strategies

| Strategy | Mechanism | Risk | Use when |
|---|---|---|---|
| **LWW (Last-Write-Wins)** | Latest timestamp wins | Concurrent writes can lose data | Acceptable to lose some updates |
| **Multi-value / sibling** | Keep all conflicting values, surface to application | Application complexity | Business logic must resolve |
| **Operational Transformation** | Transform concurrent ops to be commutative | Complex, hard to implement correctly | Real-time text collaboration |
| **CRDT** | Data structure that merges automatically | Limited data types, memory overhead | Counters, sets, flags, collaborative editing |

---

## Limitations

CRDTs are not magic:

```
✗ Not all data types have CRDT implementations
  (arbitrary relational data is hard to model as CRDT)

✗ Memory overhead
  OR-Set: stores all historical tokens for all elements
  Can grow large without garbage collection

✗ Semantics can surprise
  2P-Set: once removed, never re-addable
  LWW-Set: concurrent add+remove → winner depends on clock

✗ Sequence CRDTs are complex
  Text editing requires specialized CRDTs (RGA, etc.)
  Implementation bugs can cause ordering issues

✓ Best fit: simple counters, sets of independent items,
  presence flags, last-writer-wins registers
```

---

## Interview talking points

!!! tip "Key things to say"
    1. CRDTs solve concurrent writes without coordination — no locks, no consensus needed for the merge
    2. The three properties (commutativity, associativity, idempotency) are what make them work in any network condition
    3. G-Counter is the simplest example — each node tracks its own count, total is the sum, merge takes max per node
    4. Used in: Redis geo-replication, Riak, collaborative editing (Figma, Notion), offline-first mobile apps
    5. Tradeoff: only works for specific data types; arbitrary data (relational rows) can't be expressed as CRDTs easily
    6. LWW (Last-Write-Wins) is simpler but loses data on concurrent writes — CRDTs preserve all operations

## Related topics

- [Replication](../patterns/replication.md) — CRDTs are used in multi-leader replication to resolve conflicts
- [Consistency Models](../fundamentals/consistency-models.md) — CRDTs achieve eventual consistency without coordination
- [CAP Theorem](../fundamentals/cap-theorem.md) — CRDT-based systems are AP (available, partition-tolerant)
- [Clocks & Ordering](clocks.md) — LWW-based CRDTs depend on clock accuracy; vector clocks are safer
