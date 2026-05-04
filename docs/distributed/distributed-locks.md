# Distributed Locks

## What it is

A distributed lock ensures that only one process (across multiple servers) can execute a critical section at a time. It's the distributed equivalent of a mutex or semaphore in a single process.

```
Without distributed lock:
  Server A: reads job "send_invoice_123" from queue → starts processing
  Server B: reads same job "send_invoice_123" from queue → starts processing
  Result: customer receives two invoices

With distributed lock:
  Server A: acquires lock "job:send_invoice_123" → processes → releases lock
  Server B: tries to acquire "job:send_invoice_123" → BLOCKED until A releases
  Result: only one invoice sent
```

---

## When you need a distributed lock

```
✓ Exactly-once job processing (cron jobs, background workers)
✓ Preventing duplicate payments or double charges
✓ Leader election (who's in charge right now?)
✓ Mutual exclusion for a shared resource (only one writer at a time)
✓ Rate limiting across servers (10 req/sec globally, not per-instance)
✓ Distributed ID generation (ensure uniqueness)

✗ Don't use for: read-heavy operations, optimistic concurrency (use version numbers instead)
```

---

## Implementation 1: Redis SETNX (Simple)

The most common approach. Uses Redis `SET key value NX PX ttl`:
- `NX` — set only if the key does Not eXist (atomic acquire)
- `PX ttl` — auto-expire after N milliseconds (prevents lock being held forever if process crashes)

```python
import redis
import uuid
import time

class RedisLock:
    def __init__(self, redis_client: redis.Redis, key: str, ttl_ms: int = 30_000):
        self.redis = redis_client
        self.key = f"lock:{key}"
        self.ttl_ms = ttl_ms
        self.token = str(uuid.uuid4())  # unique token per lock holder
    
    def acquire(self, timeout_s: float = 10.0) -> bool:
        """Try to acquire lock, retrying until timeout."""
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            # SET key token NX PX ttl_ms
            acquired = self.redis.set(
                self.key,
                self.token,
                nx=True,           # only set if not exists
                px=self.ttl_ms,    # auto-expire after ttl_ms
            )
            if acquired:
                return True
            time.sleep(0.1)  # wait before retry
        return False  # timed out
    
    def release(self):
        """Release lock — only if WE hold it (compare token)."""
        # Lua script: atomic check-and-delete
        script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
        """
        self.redis.eval(script, 1, self.key, self.token)
    
    def __enter__(self):
        if not self.acquire():
            raise LockAcquisitionError(f"Could not acquire lock: {self.key}")
        return self
    
    def __exit__(self, *args):
        self.release()

# Usage
with RedisLock(redis_client, "invoice:inv_123", ttl_ms=60_000):
    send_invoice("inv_123")
    # Lock auto-released when block exits (or auto-expires after 60s if crash)
```

**Why the unique token matters:**

```
Without token check on release:
  T=0: Server A acquires lock, sets TTL=10s
  T=10s: A's lock expires (A is slow)
  T=10s: Server B acquires the lock
  T=10s: Server A finishes, calls DEL → deletes B's lock!
  T=10s: Server C acquires the lock — now A and C both run

With token check:
  Server A's token = "abc", Server B's token = "xyz"
  Server A calls release → checks: does key == "abc"? No (it's "xyz") → no-op
  Server B's lock is safe
```

---

## Implementation 2: Redis Redlock (Multi-node)

Single Redis node is a single point of failure. If Redis goes down, no locks can be acquired. **Redlock** uses N independent Redis nodes (typically 5) and acquires the lock on a majority (3/5):

```python
import redis
import uuid
import time

class Redlock:
    def __init__(self, redis_nodes: list[redis.Redis], ttl_ms: int = 30_000):
        self.nodes = redis_nodes
        self.ttl_ms = ttl_ms
        self.quorum = len(redis_nodes) // 2 + 1  # majority
    
    def acquire(self, key: str) -> tuple[bool, str]:
        token = str(uuid.uuid4())
        start_time = time.monotonic()
        acquired_count = 0
        
        for node in self.nodes:
            try:
                result = node.set(f"lock:{key}", token, nx=True, px=self.ttl_ms)
                if result:
                    acquired_count += 1
            except redis.RedisError:
                pass  # node down — continue to next
        
        elapsed_ms = (time.monotonic() - start_time) * 1000
        validity_ms = self.ttl_ms - elapsed_ms - 2  # drift factor
        
        if acquired_count >= self.quorum and validity_ms > 0:
            return True, token
        
        # Failed — release what we acquired
        self.release(key, token)
        return False, ""
    
    def release(self, key: str, token: str):
        script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        end
        return 0
        """
        for node in self.nodes:
            try:
                node.eval(script, 1, f"lock:{key}", token)
            except redis.RedisError:
                pass

# 5 independent Redis nodes
nodes = [redis.Redis(host=h) for h in ['r1', 'r2', 'r3', 'r4', 'r5']]
redlock = Redlock(nodes, ttl_ms=30_000)

acquired, token = redlock.acquire("invoice:inv_123")
if acquired:
    try:
        send_invoice("inv_123")
    finally:
        redlock.release("invoice:inv_123", token)
```

**Redlock controversy:** Martin Kleppmann argued Redlock is fundamentally unsafe under certain conditions (GC pauses, clock drift). For safety-critical locks, use ZooKeeper or etcd with fencing tokens instead.

---

## Implementation 3: ZooKeeper / etcd (Strongly Consistent)

ZooKeeper and etcd provide linearizable reads and writes — much stronger guarantees than Redis.

### ZooKeeper distributed lock

```python
from kazoo.client import KazooClient
from kazoo.recipe.lock import Lock

zk = KazooClient(hosts='zk1:2181,zk2:2181,zk3:2181')
zk.start()

lock = zk.Lock("/locks/invoice-processing", "my-identifier")

with lock:
    # ZooKeeper guarantees: only ONE process holds this lock across the cluster
    send_invoice("inv_123")
```

**How ZooKeeper locks work internally:**

```
Process acquires lock:
  1. Creates ephemeral sequential znode: /locks/invoice-123/lock-0000000001
  2. Gets list of all children: [lock-0000000001, lock-0000000002]
  3. If own znode has lowest sequence number → lock acquired
  4. Otherwise → watch the znode with the next-lower sequence number

Process releases lock (or crashes):
  1. Deletes own ephemeral znode
  2. ZooKeeper notifies the next waiter → it acquires the lock
  
If process crashes: ephemeral znode auto-deleted → lock auto-released
No TTL needed — liveness guaranteed by session
```

### etcd distributed lock

```python
import etcd3

client = etcd3.client(host='etcd.internal', port=2379)

with client.lock('invoice:inv_123', ttl=30):
    # etcd lease-based lock — auto-released if lease expires
    send_invoice("inv_123")
```

---

## Fencing tokens — the safety layer

Even with a distributed lock, a process can hold a lock past its expiry due to GC pauses or slow I/O. A **fencing token** ensures stale lock holders can't corrupt state:

```
Problem:
  t=0:  Server A acquires lock (token=100), TTL=30s
  t=30: Lock expires — Server B acquires lock (token=101)
  t=31: Server A (resumed from GC pause) tries to write to storage
        A has stale lock — it doesn't know it expired!
        A writes, overwriting B's changes → corruption

Solution: fencing token
  Storage server rejects writes with token < max_seen_token

  t=0:  Server A acquires lock, gets fencing token=100
  t=30: Server B acquires lock, gets fencing token=101
  t=31: Server A tries to write with token=100
        Storage: 100 < 101 (B's write already went through) → REJECT A's write
```

```python
class FencedStorage:
    def __init__(self):
        self.max_token = 0
    
    def write(self, data: dict, fencing_token: int):
        if fencing_token < self.max_token:
            raise StaleTokenError(
                f"Token {fencing_token} is stale, current max is {self.max_token}"
            )
        self.max_token = fencing_token
        self._do_write(data)

# ZooKeeper and etcd provide monotonically increasing tokens (zxid, revision)
# Redis does not provide fencing tokens — another reason for ZK/etcd in critical paths
```

---

## Lock TTL strategy

Setting the TTL requires balancing two failure modes:

```
TTL too short:
  Lock expires while legitimate holder is still working
  → Two processes run concurrently (the thing you were preventing)

TTL too long:
  Process crashes holding lock
  → Lock stuck until TTL expires
  → Other processes blocked for TTL duration

Strategy:
  Set TTL to: max expected processing time × 2
  
  If a job normally takes 5s, set TTL to 10-30s.
  If you can't bound processing time: use lock renewal
```

### Lock renewal (heartbeat)

```python
import threading

class RenewableLock:
    def __init__(self, redis, key, ttl_ms=30_000):
        self.redis = redis
        self.key = key
        self.ttl_ms = ttl_ms
        self.token = str(uuid.uuid4())
        self._stop_renewal = threading.Event()
    
    def acquire(self) -> bool:
        return bool(self.redis.set(self.key, self.token, nx=True, px=self.ttl_ms))
    
    def start_renewal(self):
        """Renew lock TTL periodically while holding it."""
        def renew():
            while not self._stop_renewal.wait(timeout=self.ttl_ms / 3000):  # renew at 1/3 TTL
                script = """
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("pexpire", KEYS[1], ARGV[2])
                end
                return 0
                """
                self.redis.eval(script, 1, self.key, self.token, self.ttl_ms)
        
        threading.Thread(target=renew, daemon=True).start()
    
    def release(self):
        self._stop_renewal.set()
        script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        end
        return 0
        """
        self.redis.eval(script, 1, self.key, self.token)
```

---

## Comparison: Redis vs ZooKeeper vs etcd

| | Redis SETNX | Redlock | ZooKeeper | etcd |
|---|---|---|---|---|
| Consistency | Eventual | Weak | Strong (linearizable) | Strong (linearizable) |
| Fencing tokens | No | No | Yes (zxid) | Yes (revision) |
| Auto-release on crash | Via TTL | Via TTL | Via ephemeral node | Via lease |
| Performance | Very fast | Fast | Moderate | Moderate |
| Operational complexity | Low | Medium | High | Medium |
| Best for | Rate limiting, dedup | Multi-region jobs | Safety-critical, leader election | K8s leader election, config |

---

## Common patterns using distributed locks

### Exactly-once job processing

```python
def process_job(job_id: str):
    with RedisLock(redis, f"job:{job_id}", ttl_ms=60_000) as lock:
        # Check if already processed (idempotency)
        if job_db.is_processed(job_id):
            return
        
        do_work(job_id)
        job_db.mark_processed(job_id)
```

### Leader election (simple)

```python
class LeaderElection:
    def __init__(self, redis, node_id: str):
        self.redis = redis
        self.node_id = node_id
        self.is_leader = False
    
    def try_become_leader(self) -> bool:
        # The "leader" holds a lock with TTL
        acquired = self.redis.set(
            "service:leader",
            self.node_id,
            nx=True,
            ex=30,  # 30s TTL — must renew to stay leader
        )
        self.is_leader = bool(acquired)
        return self.is_leader
    
    def renew_leadership(self):
        """Called every 10s to stay leader."""
        # Only renew if we are the current leader
        current = self.redis.get("service:leader")
        if current == self.node_id.encode():
            self.redis.expire("service:leader", 30)
```

---

## Interview talking points

!!! tip "Key things to say"
    1. The unique token prevents a slow/crashed process from releasing another process's lock
    2. TTL is a safety net, not the primary release mechanism — always release explicitly
    3. Fencing tokens are the correct answer to "what if the lock expires while the process is still running?"
    4. Redis SETNX is fine for most use cases; Redlock is controversial; ZooKeeper/etcd for truly critical paths
    5. Distributed locks don't prevent all races — they reduce the window. Pair with idempotency for full safety
    6. For leader election specifically, ZooKeeper is the battle-tested choice

## Related topics

- [Leader Election](leader-election.md) — distributed locks power leader election
- [Consensus (Raft & Paxos)](consensus.md) — ZooKeeper/etcd implement consensus internally
- [Idempotency](../patterns/idempotency.md) — pair with locks for exactly-once semantics
- [Failure Detection](failure-detection.md) — detecting when a lock holder has failed
