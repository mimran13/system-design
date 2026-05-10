# Space-Based Architecture

Space-based architecture (SBA) eliminates the database bottleneck by keeping all working state in a distributed in-memory grid. Originally derived from "tuple spaces" (the Linda model), SBA is built for extreme throughput workloads — trading durability and complexity for raw speed and elasticity. The pattern lives on in modern systems: Hazelcast, Apache Ignite, in-memory data grids, and many high-frequency trading platforms.

---

## The problem it solves

Traditional architecture:

```
Web tier ──► App tier ──► Database
                          ↑
                          bottleneck under high write rates
                          fixed-size; vertical scale only goes so far
```

When writes saturate the database, classic mitigations (sharding, caching) reach their limits. SBA's answer: **don't go to the database in the request path**.

---

## The shape

```
                ┌──────────────────┐
                │ Processing Unit  │  ◄── replicate ──┐
                │   (cache + app)  │                  │
                └────────┬─────────┘                  │
                         │                            │
                         ▼                            │
                ┌─────────────────────┐               │
                │ In-memory data grid │ ◄─ replicate ─┘
                │ (the "space")       │
                └──────────┬──────────┘
                           │ async
                           ▼
                ┌──────────────────┐
                │  Backing DB      │   (write-behind, durability)
                └──────────────────┘
```

Components:

- **Processing units (PUs)**: stateless app + a chunk of the in-memory grid
- **Data grid / "space"**: distributed in-memory store, partitioned across PUs
- **Messaging grid**: distributed event bus for inter-PU coordination
- **Data write grid**: writes to backing DB asynchronously
- **Deployment manager**: scales PUs up/down

All hot data lives in the grid. The DB is the **system of record** but not in the request path.

---

## Why this is fast

```
Traditional: app ──► DB read (10 ms) ──► DB write (5 ms)
SBA:         app ──► grid read (<1 ms) ──► grid write (<1 ms)
```

Memory access is 1000× faster than disk. By keeping everything in RAM, SBA achieves microsecond latency at very high QPS.

The DB write happens asynchronously — write-behind:

```
1. App writes to grid (sync, 1 ms)
2. Grid acks
3. Async batch job writes to DB (eventual)
4. On failure: replay from grid log
```

If a node crashes before write-behind completes, replicate from the in-grid replicas. If the whole grid loses data: replay from the DB (which has eventual consistency).

---

## Key properties

### In-memory state

All hot state is RAM. Disk is for durability, not the request path.

### Partitioning + replication

Data partitioned across PUs (often consistent hashing). Each partition replicated 2-3× for fault tolerance.

### Co-location

App code runs near its data. A PU handling user X has user X's data locally. Operations on X don't need network calls.

### Asynchronous durability

Writes to backing DB happen out of the request path. App responds before DB has the write.

### Elastic scaling

Scale by adding PUs. The grid rebalances; app keeps running.

---

## Where it fits

```
✓ Ultra-low-latency requirements (sub-millisecond)
✓ Very high write throughput (100K+ writes/sec)
✓ Bursty load with elastic scaling needs
✓ Trading, real-time bidding, gaming, real-time analytics
✓ Scenarios where DB bottlenecks are the limiting factor

✗ Strong durability requirements (you can't lose any write)
✗ Modest scale where database fits comfortably
✗ Complex multi-table joins (grid is key-value-ish)
✗ Teams without distributed-systems expertise
```

This is a specialised architecture. Most products don't need it. When you do, the trade-offs are real.

---

## Examples

### High-frequency trading

```
Order book lives in memory across grid nodes
Each order processed in microseconds
Match engine runs on the same PU as the order data (co-location)
Audit log written async to disk-backed log
```

Trading platforms use this style; vendor systems (TIBCO, Hazelcast Jet, custom platforms) implement SBA principles.

### Real-time bidding (RTB)

```
Ad request arrives → SBA grid:
  - User profile loaded (or cached)
  - Bidding rules evaluated
  - Bid generated and sent
  All within ~50ms total budget
```

Backing storage is the "system of record"; the grid is what handles real traffic.

### Gaming session state

Each player's session state in the grid; updates propagate via messaging grid; backing DB has the long-term record. Transition from match to match doesn't touch DB.

### Real-time analytics

Stream events into the grid; aggregations updated in-memory; periodic flush to OLAP store.

---

## Comparing with caching

Both put data in memory. Different goals:

| | Cache | Space-based |
|---|---|---|
| Source of truth | Database | Database (eventual) but app reads/writes the grid |
| Write path | Cache invalidation; DB is primary | Grid is primary; DB is async backup |
| Coupling | Optional layer | Architectural cornerstone |
| Failure mode | Cache miss → DB | Replay from replicas; eventual DB recovery |

Caching is a tactic. SBA is a strategy.

---

## Implementation technologies

| Tool | Notes |
|---|---|
| **Hazelcast** | Open-source IMDG; distributed maps, queues, locks |
| **Apache Ignite** | Distributed grid + SQL; broader feature set |
| **Coherence (Oracle)** | Enterprise-grade IMDG |
| **GridGain** | Apache Ignite commercial fork |
| **Redis Enterprise** | Active-active replication; can serve as the grid |
| **Aerospike** | Hybrid memory/SSD; high throughput |
| **Custom in-process grids** | When you need control |

Modern alternatives:

- **DynamoDB / Cosmos DB** with DAX / DAX-equivalent caching — simpler, less performant
- **Stream processors with state stores** (Kafka Streams, Flink) for some workloads

---

## Patterns within SBA

### Co-location

Routing requests to the PU that owns the data:

```
Request for user 12345 → hash(12345) → PU 7 → handles locally
```

This avoids network hops to fetch data. The router (in PU itself or external) computes the routing key.

### Near-cache

Each PU has a local cache of partitions it doesn't own. Reads go to local cache; writes go to the owner.

### Write-behind

```
1. App writes to grid (atomic)
2. Write enqueued for DB
3. Background process flushes to DB in batches
4. On crash: replicate from grid replicas; DB catches up via replay
```

### Backup / fail-over

Each partition has N replicas (N=2 or 3 typical). If primary dies, a replica promotes. Old primary's data stream replayed when it returns.

---

## Failure modes

### PU crash

Replica takes over. Routing updates. New PU spun up to restore replication factor.

### Data center loss

Multi-DC replication: grid replicates across DCs. One DC down = degraded but functional.

### Grid-wide failure

Worst case: replay from backing DB. Operations resume; data from in-flight period may be lost (the cost of write-behind).

### Network partition

Same problem as any distributed system. SBA leans on quorum-based replication. Split-brain prevention via fencing.

See [Split Brain & Fencing](../distributed/split-brain.md).

---

## Cost model

```
Compute: many smaller PU instances
Memory: a lot — entire working set in RAM
Network: replication traffic, often cross-AZ
Database: smaller, but still required for durability
```

Memory is the dominant cost. A 1 TB working set replicated 3× = 3 TB of RAM across the grid. At cloud prices, that's expensive.

The case for SBA: when DB-bottlenecked architectures hit a ceiling that costs more (in lost throughput, in vertical scale, in operational complexity) than the SBA approach.

---

## Modern relevance

SBA peaked in the 2010s with vendors selling grids. Modern systems often achieve the same goals via:

- **NoSQL databases** with SSD-class latency (DynamoDB, Cassandra)
- **Caching layers** in front of OLTP databases (Redis, Memcached)
- **Stream processors** with state stores for event-time workloads (Flink, Kafka Streams)
- **Co-located processing** (DynamoDB Streams + Lambda)

Pure SBA is now mostly seen in:

- Trading systems
- Real-time bidding
- Specialised gaming
- Grid-computing platforms (HPC contexts)

The principles — keep hot state in memory, async durability, partition + replicate, co-locate compute and data — show up everywhere though.

---

## When to consider SBA

```
1. You're hitting database write throughput limits AT scale
2. Sub-ms latency is required (not just preferred)
3. Workload tolerates eventual durability for performance
4. You can absorb operational complexity
5. Existing optimisations (caching, sharding) are exhausted
```

Otherwise: keep it simple. SBA is a hammer that turns most problems into in-memory grid problems — but most problems aren't.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you recognise an architecture pattern with specialised use cases — and avoid it when not needed.

**Strong answer pattern:**
1. Hot state in distributed in-memory grid; async write-behind to DB
2. Eliminates database from request path; achieves microsecond latency
3. Trade-offs: complexity, RAM cost, eventual durability
4. Right for trading, RTB, gaming, real-time analytics
5. Wrong for typical CRUD workloads where DB fits

**Common follow-up:** *"What's the durability story when a PU crashes mid-write?"*
> Three lines of defence. (1) The write was replicated synchronously to N-1 other PUs before being acked — quorum survival. (2) The write-behind queue replicates similarly. (3) The backing DB is the long-term system of record; on full grid failure, recover from DB. The trade-off is that very recent writes (between grid commit and DB commit) might be lost on a catastrophic multi-failure. SBA accepts this for the latency win — not appropriate for "must never lose any byte" workloads.

---

## Related topics

- [Distributed Caching](../caching/distributed-caching.md) — pieces of SBA in the cache layer
- [Sharding](../patterns/sharding.md) — partition strategy
- [Replication](../patterns/replication.md) — durability via replicas
- [Event Sourcing](../patterns/event-sourcing.md) — alternative for replay
- [Storage: Key-Value Stores](../storage/key-value-stores.md) — Aerospike, DynamoDB, ElastiCache
