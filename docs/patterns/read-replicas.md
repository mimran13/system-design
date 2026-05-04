# Read Replicas

## What it is

A read replica is a copy of a primary database that receives all writes from the primary via replication and serves read queries. You scale read throughput horizontally by adding replicas; writes still go to one primary.

```
Without read replicas:
  All reads + writes → Primary DB
  100K QPS reads + 5K QPS writes = 105K QPS on one node
  → Primary becomes the bottleneck

With read replicas:
  Writes             → Primary DB (5K QPS)
  Reads              → 5 replicas × 20K QPS each = 100K read QPS
  
  Primary now only handles writes + replication fan-out.
  Reads scale horizontally by adding replicas.
```

---

## How replication works

Primary continuously ships changes to replicas via a replication log (WAL in PostgreSQL, binlog in MySQL):

```
Primary:
  1. Client writes: UPDATE users SET name = 'Alice' WHERE id = 1
  2. Primary applies change, writes to WAL
  3. WAL entry shipped to each replica (streaming replication)

Replica:
  1. Receives WAL entry
  2. Applies same change locally
  3. Now has same data as primary (with some lag)
```

### Synchronous vs asynchronous replication

```
Asynchronous (default):
  Primary acknowledges write BEFORE replica confirms receipt
  
  Pros: Low write latency (no waiting for replica)
  Cons: Replica can be behind — replication lag
  
  Primary ──write──► Client ACK
             │
             └──► Replica (async, may be milliseconds behind)

Synchronous (PostgreSQL: synchronous_commit = on):
  Primary waits for at least one replica to confirm WAL receipt
  before acknowledging to client
  
  Pros: Zero data loss on primary failure (replica has all data)
  Cons: Write latency increases (must wait for replica round-trip)
  
  Primary ──write──► Replica ACK ──► Client ACK
```

**Default for most systems:** Asynchronous. The lag is typically milliseconds — acceptable for most use cases.

---

## The replication lag problem

Replication lag is the delay between a write on the primary and that write being visible on replicas. This causes subtle consistency bugs:

```
t=0ms  Client A writes: UPDATE posts SET likes = 100 WHERE id = 5
t=0ms  Primary confirms write
t=2ms  Replica receives and applies the WAL entry (2ms lag)

t=1ms  Client B reads from replica:
         SELECT likes FROM posts WHERE id = 5
         → Returns 99 (stale!) — replica hasn't caught up yet

t=3ms  Client B reads again:
         → Returns 100 (now current)
```

This is **eventual consistency** within a single datacenter — typically milliseconds, but can grow to seconds under heavy load.

---

## Read-after-write consistency

The most common bug pattern: a user writes something, then immediately reads it back — but reads go to a replica that hasn't caught up yet.

```
Scenario:
  1. User uploads profile photo
  2. Server writes to primary: UPDATE users SET photo = 'new.jpg' WHERE id = 1
  3. Server redirects user to profile page
  4. Profile page reads from replica → shows OLD photo (replica lag)
  5. User thinks the upload failed, uploads again

This is read-after-write inconsistency.
```

### Solutions

**1. Route reads-after-writes to primary:**

```python
class UserRepository:
    def __init__(self, primary_db, replica_db):
        self.primary = primary_db
        self.replica = replica_db
    
    def update_profile(self, user_id: int, data: dict) -> None:
        self.primary.execute(
            "UPDATE users SET photo = %s WHERE id = %s",
            (data['photo'], user_id)
        )
    
    def get_own_profile(self, user_id: int) -> dict:
        # Reading your own profile: must be fresh → use primary
        return self.primary.query_one(
            "SELECT * FROM users WHERE id = %s", (user_id,)
        )
    
    def get_other_profile(self, user_id: int) -> dict:
        # Reading someone else's profile: stale is fine → use replica
        return self.replica.query_one(
            "SELECT * FROM users WHERE id = %s", (user_id,)
        )
```

**2. Track write timestamp, read from primary until replica catches up:**

```python
import time
import redis

class ReplicaRouter:
    """
    After a write, route subsequent reads for that user to primary
    for a brief window (enough time for replica to catch up).
    """
    
    def __init__(self, primary, replica, redis_client: redis.Redis):
        self.primary = primary
        self.replica = replica
        self.redis = redis_client
        self.PRIMARY_WINDOW_SECONDS = 5  # route to primary for 5s after write
    
    def after_write(self, user_id: int) -> None:
        """Call this after any write on behalf of user_id."""
        self.redis.setex(
            f"read_primary:{user_id}",
            self.PRIMARY_WINDOW_SECONDS,
            "1",
        )
    
    def get_connection(self, user_id: int):
        """Return primary if user recently wrote, else replica."""
        if self.redis.exists(f"read_primary:{user_id}"):
            return self.primary
        return self.replica
```

**3. Read your own writes via sticky session (simplest):**
Route all requests for the same user to the same app server, which maintains a short write-cache in memory. Avoids DB routing complexity but limits app server scalability.

---

## When to use read replicas

```
Good fit:
  ✓ Read-heavy workloads (read:write > 5:1)
  ✓ Reporting / analytics queries that are slow and shouldn't
    block transactional queries
  ✓ Geographically distributed reads (replica near users)
  ✓ You've already optimized indexes and queries — reads are
    still the bottleneck

Not the right tool:
  ✗ Write-heavy workloads (replicas don't help write bottleneck)
  ✗ Data that requires strong consistency (use primary, or
    switch to a distributed DB like CockroachDB / Spanner)
  ✗ Very low tolerance for replication lag
```

---

## Read replicas vs sharding

These solve different problems:

| | Read Replicas | Sharding |
|---|---|---|
| **Problem solved** | Too many reads for one node | Too much data / too many writes for one node |
| **How it scales** | Horizontal read scale (all replicas have all data) | Horizontal write scale + storage (each shard has subset) |
| **Write path** | All writes still go to one primary | Writes distributed across shards |
| **Complexity** | Low — most databases support it natively | High — routing, cross-shard queries, rebalancing |
| **Data** | Full copy on every node | Partitioned — each node has a subset |
| **When to reach for it** | Read:write >> 1:1 | Data too large for one machine, or writes are the bottleneck |

**Evolution path:**
```
Single primary
    ↓ reads become bottleneck
Add read replicas (one primary, multiple replicas)
    ↓ writes or data size become bottleneck
Shard (multiple primaries, each with their own replicas)
```

---

## AWS: RDS Read Replicas

```python
# AWS RDS supports up to 15 read replicas per primary
# Connection strings differ:
#
# Primary:  mydb.cluster-xyz.us-east-1.rds.amazonaws.com
# Replica:  mydb.cluster-ro-xyz.us-east-1.rds.amazonaws.com
#           (Aurora provides a reader endpoint that load-balances across replicas)

import boto3
import os

PRIMARY_DSN   = os.environ['DB_PRIMARY_URL']   # writer endpoint
REPLICA_DSN   = os.environ['DB_REPLICA_URL']   # reader endpoint (Aurora)

# Aurora-specific: cluster reader endpoint automatically routes to 
# the least-loaded available replica. If all replicas fail, it 
# falls back to the primary.

# Cross-region read replicas:
# Useful for disaster recovery AND serving reads closer to users
# Lag increases significantly across regions (tens of ms vs <1ms in same region)
```

### Aurora vs RDS replication

| | RDS (MySQL/PostgreSQL) | Aurora |
|---|---|---|
| Replication | Binlog/WAL streaming (async) | Shared storage volume (near-synchronous) |
| Replica lag | Milliseconds to seconds | Typically < 10ms |
| Max replicas | 5 (MySQL), 5 (PostgreSQL) | 15 Aurora Replicas |
| Failover | Manual or Multi-AZ automatic | Automatic (typically < 30s) |
| Reader endpoint | Manual (you pick one) | Cluster reader endpoint (load-balanced) |

---

## Monitoring replication lag

```sql
-- PostgreSQL: check lag on primary (shows how far behind each replica is)
SELECT
    client_addr,
    state,
    sent_lsn,
    write_lsn,
    flush_lsn,
    replay_lsn,
    (sent_lsn - replay_lsn) AS replication_lag_bytes
FROM pg_stat_replication;

-- On the replica: check its own lag
SELECT
    now() - pg_last_xact_replay_timestamp() AS replication_lag;
```

```python
# CloudWatch metric for Aurora
# aws_rds_replica_lag: seconds of lag between primary and replica
# Alert if lag > 30 seconds (adjust based on your tolerance)
```

**Rule of thumb:** If replica lag consistently exceeds your tolerance, you have a write throughput problem (replica can't keep up), not a read problem. Adding more replicas won't fix this — you need to optimize writes or shard.

---

## Interview talking points

!!! tip "Key things to say"
    1. Read replicas solve read bottlenecks — writes still go through one primary. If writes are the problem, you need sharding, not replicas
    2. Replication is async by default — there is always some lag, typically milliseconds. Design around this with read-after-write consistency patterns
    3. The classic bug: user writes data, immediately reads it from a replica that hasn't caught up yet. Solution: route the user's own reads to primary for a short window after writes
    4. Aurora's shared storage volume gives near-synchronous replication with sub-10ms lag vs traditional async replication — mention this when discussing AWS
    5. Evolution: start with one primary → add read replicas as reads scale → shard when writes or data volume exceed what one primary can handle

## Related topics

- [Replication](replication.md) — the full replication patterns (single-leader, multi-leader, leaderless)
- [Sharding](sharding.md) — when read replicas aren't enough (write bottleneck, data size)
- [CAP Theorem](../fundamentals/cap-theorem.md) — replica lag = brief AP behavior within your own cluster
- [Consistency Models](../fundamentals/consistency-models.md) — read-after-write, monotonic reads
