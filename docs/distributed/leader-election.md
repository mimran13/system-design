# Leader Election

## What it is

Leader election is the process by which distributed nodes choose one node to serve as the coordinator (leader). Only the leader performs certain privileged operations — scheduling jobs, accepting writes, managing shard assignments.

## Why you need it

```
Problem: you have 3 instances of a cron job service
If all 3 run the same job: emails sent 3x, orders processed 3x

Solution: elect a leader
  Only the leader runs the cron job
  If leader dies → elect a new one
```

## Approaches

### Using a distributed lock (Redis / etcd / ZooKeeper)

The simplest approach: the leader holds a lock. If the lock expires, another node acquires it.

**Redis-based (Redlock):**
```python
import redis
import uuid
import time

class LeaderElection:
    def __init__(self, redis_client, key, ttl_seconds=30):
        self.redis = redis_client
        self.key = key
        self.ttl = ttl_seconds
        self.node_id = str(uuid.uuid4())
        self.is_leader = False
    
    def try_acquire_leadership(self) -> bool:
        # SET key node_id NX EX ttl  (atomic: set only if not exists)
        result = self.redis.set(
            self.key, self.node_id,
            nx=True,    # only if not exists
            ex=self.ttl # expire after ttl seconds
        )
        self.is_leader = result is not None
        return self.is_leader
    
    def renew_leadership(self) -> bool:
        """Renew TTL if still leader (Lua script for atomicity)"""
        script = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then
            return redis.call('EXPIRE', KEYS[1], ARGV[2])
        else
            return 0
        end
        """
        result = self.redis.eval(script, 1, self.key, self.node_id, self.ttl)
        self.is_leader = result == 1
        return self.is_leader
    
    def release_leadership(self):
        script = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then
            return redis.call('DEL', KEYS[1])
        else
            return 0
        end
        """
        self.redis.eval(script, 1, self.key, self.node_id)
        self.is_leader = False

# Usage
election = LeaderElection(redis_client, "cron-leader", ttl_seconds=30)

def run_loop():
    while True:
        if election.try_acquire_leadership():
            print("I am the leader")
            while election.renew_leadership():
                run_job()          # do leader work
                time.sleep(10)     # renew every 10s (TTL is 30s)
        else:
            print("I am a follower, waiting...")
            time.sleep(5)
```

**Safety concern:** What if the leader is paused (GC pause, VM migration) and its TTL expires? A new leader is elected while the old leader still thinks it's leader → two leaders (split-brain).

**Fencing tokens:** Solve split-brain:
```
Leader gets token=5 from lock service
New leader gets token=6

Old leader tries to write to storage with token=5
Storage: current token is 6, reject (5 < 6)
```

### etcd-based leader election (production-grade)

```python
import etcd3
import time

client = etcd3.client()

def campaign_for_leadership(node_id: str, ttl: int = 30):
    # etcd's election API (built on compare-and-swap + TTL leases)
    lease = client.lease(ttl)
    
    # Try to put our node_id at the election key
    # Succeeds only if the key doesn't exist (CAS)
    election = client.election("/services/scheduler/leader")
    
    try:
        election.campaign(node_id, lease)
        print(f"Node {node_id} is now leader")
        
        while True:
            # Periodically refresh lease (keepalive)
            lease.refresh()
            
            # Do leader work
            run_scheduled_jobs()
            time.sleep(10)
    
    except Exception:
        print("Lost leadership")
    
    finally:
        lease.revoke()  # release immediately on exit
```

etcd's election uses MVCC (multi-version concurrency control) — the node with the smallest revision that created a key wins. This is linearizable — no split-brain.

### Kubernetes leader election

Kubernetes itself provides a leader election mechanism via API server leases:

```python
from kubernetes import client, config
from kubernetes.client import V1Lease, V1LeaseSpec, V1ObjectMeta
import datetime

def kubernetes_leader_election():
    config.load_in_cluster_config()
    coordination_v1 = client.CoordinationV1Api()
    
    lease_name = "my-controller-leader"
    namespace = "default"
    identity = os.environ["POD_NAME"]  # current pod
    
    while True:
        try:
            # Try to acquire/renew lease
            lease = coordination_v1.read_namespaced_lease(lease_name, namespace)
            
            if lease.spec.holder_identity == identity:
                # Renew: update renewTime
                lease.spec.renew_time = datetime.datetime.utcnow()
                coordination_v1.replace_namespaced_lease(lease_name, namespace, lease)
                run_as_leader()
            else:
                # Check if expired
                age = datetime.datetime.utcnow() - lease.spec.renew_time
                if age > datetime.timedelta(seconds=lease.spec.lease_duration_seconds):
                    # Expired — try to take over
                    lease.spec.holder_identity = identity
                    lease.spec.acquire_time = datetime.datetime.utcnow()
                    coordination_v1.replace_namespaced_lease(lease_name, namespace, lease)
        
        except client.exceptions.ApiException as e:
            if e.status == 404:
                # Create lease (first time)
                create_lease(coordination_v1, lease_name, namespace, identity)
        
        time.sleep(5)
```

Go's `k8s.io/client-go/tools/leaderelection` package handles this in production.

### Bully algorithm (classic, rarely used in production)

Processes with IDs (highest wins). When a process detects leader failure:
1. Send election message to all higher-ID processes
2. If no response → declare yourself leader
3. If higher-ID process responds → they handle the election

Simple but chatty. Not used in modern systems — use consensus-based approach.

## Failure scenarios

### Leader crash

```
t=0:  Leader A holds lock (TTL=30s)
t=5:  Leader A crashes
t=35: TTL expires (worst case: 30s)
t=35: Follower B acquires lock → new leader
t=35: 30-second leadership gap

Reduce gap: shorter TTL + faster heartbeat
Risk of shorter TTL: leader paused (GC) → spurious failover
```

### Network partition

```
Network splits: {A, B} | {C}
A holds the lock → continues as leader
C can't reach A → A's TTL expires in C's view after 30s → C elects itself

Split-brain!

Solution:
  Fencing tokens: storage layer rejects writes from old leader
  etcd/ZooKeeper: majority required to maintain lock
    → {A, B} = majority → A stays leader
    → {C} = minority → C can't win election (no majority)
```

## AWS leader election

**AWS MSK / ECS / EC2 patterns:**

**Option 1: DynamoDB conditional writes**
```python
dynamodb.put_item(
    TableName='leader-election',
    Item={'service': 'scheduler', 'leader': 'node-1', 'ttl': int(time.time()) + 30},
    ConditionExpression='attribute_not_exists(service) OR #ttl < :now',
    ExpressionAttributeNames={'#ttl': 'ttl'},
    ExpressionAttributeValues={':now': int(time.time())}
)
```

**Option 2: ElastiCache Redis** (as shown above)

**Option 3: Route 53 failover** (for service-level failover, not process-level)

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you identify when a singleton pattern is needed and choose the right mechanism.

**Strong answer pattern:**
1. Identify the singleton requirement: "only one scheduler/writer/coordinator"
2. Use distributed lock with TTL (Redis or etcd) — don't assume one process stays alive
3. Handle the gap period: what happens if no leader for up to TTL seconds?
4. Handle split-brain with fencing tokens
5. For Kubernetes: built-in leader election via Lease objects

## Related topics

- [Consensus (Raft & Paxos)](consensus.md) — leader election built on consensus
- [Failure Detection](failure-detection.md) — how leader failure is detected
- [Key-Value Stores](../storage/key-value-stores.md) — Redis as the lock store
- [Distributed Transactions](distributed-transactions.md) — leader may coordinate transactions
