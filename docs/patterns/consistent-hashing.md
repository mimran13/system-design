---
tags:
  - interview-critical
  - for-scale
---

# Consistent Hashing

## You'll see this when...

- Adding a node to your cache cluster moved 90% of keys (cache stampede)
- Resharding takes hours / data migration is a nightmare
- Cassandra, DynamoDB, Riak, ScyllaDB — they all use consistent hashing internally
- Memcached client libraries (libketama) use it for sharding
- Load balancer with "session affinity" or "sticky sessions" by hash
- A "ring" or "token" comes up in your data store's docs
- "Virtual nodes" or "vnodes" mentioned in cluster config

## The problem

When you have N servers and want to distribute keys across them, the naive approach is:

```
server_index = hash(key) % N
```

This works until you add or remove a server. When N changes:

```
N=3: hash("user_123") % 3 = 1 → Server 1
N=4: hash("user_123") % 4 = 3 → Server 3

Every key is remapped! All cached data is invalid.
In a cache: 100% cache miss on every node change.
In a DB: massive data movement.
```

## The solution: consistent hashing

Map both servers and keys onto a ring (hash space 0 to 2³²-1). Each key is assigned to the **next clockwise server** on the ring.

```
Hash ring: 0 ────────────────────────── 2³²
                  B         A
    ┌─────────────●─────────●───────────────────┐
    │    C                             D         │
    └────●─────────────────────────────●────────┘
    
Keys:
  hash(key1) = X → next clockwise server = B
  hash(key2) = Y → next clockwise server = A
  hash(key3) = Z → next clockwise server = D
```

When a server is added or removed:
```
Remove Server B:
  Keys previously pointing to B → now point to A (next clockwise)
  All other keys unchanged

Only 1/N keys need to move on average.
A cache with 10 servers: only 10% of keys remapped on add/remove.
```

## Virtual nodes (VNodes)

With few servers, key distribution can be uneven (some servers get more keys):

```
Without VNodes (4 servers):
  Server A: 35% of ring
  Server B: 20% of ring
  Server C: 30% of ring  ← uneven load
  Server D: 15% of ring
```

**Virtual nodes:** Each physical server maps to multiple positions on the ring:

```
With VNodes (150 VNodes per server):
  Server A: A1, A2, A3, ... A150 (distributed around ring)
  Server B: B1, B2, B3, ... B150
  
Result: each server handles ~25% of keys regardless of natural clustering
```

```python
import hashlib
import bisect

class ConsistentHashRing:
    def __init__(self, nodes=None, vnodes=150):
        self.vnodes = vnodes
        self.ring = {}          # hash_value → node
        self.sorted_keys = []   # sorted hash values
        
        for node in (nodes or []):
            self.add_node(node)
    
    def _hash(self, key):
        return int(hashlib.md5(key.encode()).hexdigest(), 16)
    
    def add_node(self, node):
        for i in range(self.vnodes):
            vnode_key = f"{node}:vnode:{i}"
            h = self._hash(vnode_key)
            self.ring[h] = node
            bisect.insort(self.sorted_keys, h)
    
    def remove_node(self, node):
        for i in range(self.vnodes):
            vnode_key = f"{node}:vnode:{i}"
            h = self._hash(vnode_key)
            del self.ring[h]
            self.sorted_keys.remove(h)
    
    def get_node(self, key):
        if not self.ring:
            return None
        h = self._hash(key)
        # Find next clockwise position
        idx = bisect.bisect(self.sorted_keys, h)
        if idx == len(self.sorted_keys):
            idx = 0  # wrap around
        return self.ring[self.sorted_keys[idx]]
```

## Real-world usage

### Distributed caches (Redis Cluster, Memcached)

```
Redis Cluster: 16,384 hash slots (not a continuous ring, but same concept)
hash_slot = CRC16(key) % 16384

Slot assignment:
  Node 1: slots 0-5460
  Node 2: slots 5461-10922
  Node 3: slots 10923-16383

Add node: move some slots from existing nodes to new node
Remove node: redistribute its slots before removal
```

### Cassandra

```
Cassandra uses consistent hashing to distribute data:
  partition_key → hash → token → node responsible for that token range

Add node: assigned a token range; takes data from existing nodes in that range
Replication factor 3: each partition stored on 3 consecutive nodes on ring
```

### Load balancing for stateful services

```
Consistent hash on session_id → always routes same user to same server
No shared session state needed if single-server session fits your model
```

### Sharding in custom systems

```python
# Route database writes to correct shard
ring = ConsistentHashRing(nodes=["shard-1", "shard-2", "shard-3"])

def get_shard(user_id):
    return ring.get_node(str(user_id))

# shard-1 added:
ring.add_node("shard-4")
# Only ~25% of keys remapped to shard-4, rest unchanged
```

## Rendezvous hashing (alternative)

Also called "highest random weight" hashing. For each key, compute a score for every server and pick the highest:

```python
import hashlib

def get_server(key, servers):
    best = max(servers, key=lambda s: hashlib.md5(f"{key}:{s}".encode()).hexdigest())
    return best
```

**Advantages:**
- Simpler than ring — no data structure needed
- When server removed: only its keys remapped
- Better uniformity than basic consistent hashing

**Disadvantage:** O(N) per lookup (must compute score for all servers). Not suitable for very large N.

## Jump consistent hash (Google)

More efficient for distributed storage:

```python
def jump_hash(key, num_buckets):
    b = -1
    j = 0
    while j < num_buckets:
        b = j
        key = key * 2862933555777941757 + 1
        j = int((b + 1) * (2**31 / ((key >> 33) + 1)))
    return b
```

- O(log N) time, O(1) space
- Deterministic — same key/N always gives same bucket
- Minimal remapping when N changes (N+1: only 1/N+1 keys move)

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you know *why* consistent hashing exists and when to use it, not just describe the ring.

**Strong answer pattern:**
1. Problem: modulo hashing → massive key remapping on scale change
2. Solution: consistent hashing → only 1/N keys remapped
3. Virtual nodes → even distribution
4. Apply it to: distributed caches (Redis Cluster), Cassandra, custom sharding
5. For the interview problem: "I'd use consistent hashing to distribute users across cache nodes so adding a node doesn't invalidate all cached data"

## Test yourself

Answers are hidden — commit to an answer before expanding.

??? question "Why does `hash(key) % N` cause massive remapping when N changes, while consistent hashing only remaps ~1/N of keys?"

    With modulo hashing, changing N changes the result of the modulo for nearly every key — going from N=3 to N=4 remaps essentially everything. Consistent hashing places servers and keys on a ring; a key belongs to the next clockwise server. Adding or removing a server only affects the keys between it and its neighbor, so on average only 1/N of keys move.

??? question "Why are virtual nodes needed — what problem do they solve on top of the basic ring?"

    With few physical servers, ring positions are uneven: one server might own 35% of the ring while another owns 15%. Virtual nodes map each physical server to many positions (e.g., 150 per server), so each server's total share averages out to ~1/N of keys regardless of where individual hash positions land.

??? question "You add one node to a 10-node Memcached cluster and the cache hit rate collapses to near zero across all nodes. What's happening?"

    The client is using modulo hashing (`hash(key) % N`), so changing N from 10 to 11 remapped almost every key to a different node — effectively a 100% cache miss. With consistent hashing (e.g., libketama), adding a node would have remapped only ~10% of keys.

??? question "Your team built a basic consistent hash ring with 4 servers and no virtual nodes. One server consistently handles far more traffic than the others. Why, and what's the fix?"

    Without virtual nodes, the 4 hash positions can cluster unevenly — one server may own a much larger arc of the ring (e.g., 35% vs 15%). The fix is virtual nodes: give each server ~150 positions on the ring so load evens out to ~25% each.

??? question "An interviewer asks: are there alternatives to the ring-based approach, and what are their trade-offs?"

    Rendezvous (highest-random-weight) hashing computes a score per server per key and picks the highest — simpler, no ring data structure, better uniformity, but O(N) per lookup so it doesn't suit very large N. Jump consistent hash (Google) is O(log N) time and O(1) space with minimal remapping, good for distributed storage where buckets are numbered.

## Related topics

- [Sharding](sharding.md) — consistent hashing for database sharding
- [Caching](../caching/index.md) — distributed caches use consistent hashing
- [Key-Value Stores](../storage/key-value-stores.md) — Redis Cluster, DynamoDB hash partitioning
- [Wide-Column Stores](../storage/wide-column-stores.md) — Cassandra's token ring
