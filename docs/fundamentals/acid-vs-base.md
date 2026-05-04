# ACID vs BASE

The two fundamental consistency philosophies behind every database choice. Every time you pick a database, you're implicitly choosing a point on this spectrum.

---

## ACID

ACID is the set of guarantees traditional relational databases make to ensure data validity even in the face of errors, crashes, and concurrent access.

```
A — Atomicity
C — Consistency
I — Isolation
D — Durability
```

### Atomicity

A transaction is all-or-nothing. Either every operation in the transaction succeeds, or none of them do. There is no partial success.

```sql
-- Transfer $100 from Alice to Bob
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 'alice';
  UPDATE accounts SET balance = balance + 100 WHERE id = 'bob';
COMMIT;

-- If the second UPDATE fails (Bob's account doesn't exist):
-- The first UPDATE is ROLLED BACK automatically.
-- Alice's money is not lost. The system never sees a state where
-- Alice lost $100 but Bob gained nothing.
```

**What it prevents:** Partial updates that leave data in an inconsistent state — the "money disappeared" scenario.

### Consistency

A transaction can only bring the database from one valid state to another valid state. All defined rules (constraints, cascades, triggers) must hold before and after.

```sql
-- Consistency constraint: balance can never go negative
ALTER TABLE accounts ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);

BEGIN;
  UPDATE accounts SET balance = balance - 500 WHERE id = 'alice';  -- Alice has $100
  -- DB enforces constraint: balance would be -$400 → TRANSACTION ABORTED
COMMIT;
-- Alice still has $100. Constraint maintained.
```

**What it prevents:** Constraint violations, referential integrity violations, business rule violations slipping into the database.

**Note:** Consistency in ACID is different from Consistency in CAP theorem. ACID consistency = business rules are enforced. CAP consistency = all nodes see the same data at the same time.

### Isolation

Concurrent transactions execute as if they were serial (one after another), even though they actually run simultaneously. One transaction's intermediate state is invisible to others.

```
Without isolation:
  T1: reads balance = $100
  T2: reads balance = $100
  T1: writes balance = $0  (withdrew $100)
  T2: writes balance = $0  (withdrew $100 from the same $100)
  → Alice withdrew $200 from a $100 account

With isolation (SERIALIZABLE):
  T1: reads $100, writes $0 → commits
  T2: reads $0 → sees insufficient funds → aborted
```

**Isolation levels** (weakest to strongest):

| Level | Dirty Read | Non-repeatable Read | Phantom Read |
|---|---|---|---|
| Read Uncommitted | possible | possible | possible |
| Read Committed | prevented | possible | possible |
| Repeatable Read | prevented | prevented | possible |
| Serializable | prevented | prevented | prevented |

```
Dirty Read:          T1 reads T2's uncommitted (not yet committed) data
Non-repeatable Read: T1 reads same row twice — gets different values (T2 committed between reads)
Phantom Read:        T1 reads a range twice — different rows appear (T2 inserted between reads)
```

Most databases default to **Read Committed**. PostgreSQL's default is Read Committed. MySQL InnoDB defaults to Repeatable Read.

### Durability

Once a transaction is committed, it stays committed — even if the system crashes immediately after. Committed data is written to non-volatile storage.

```
Client: COMMIT;
DB: "OK, committed"  ← disk write has happened (or WAL flushed)
Server crashes 1ms later...
Server restarts...
Data is still there. The commit is durable.
```

**How it's achieved:** Write-Ahead Log (WAL) — changes are written to a log on disk before being applied to the data files. On restart, the log is replayed.

---

## BASE

BASE is the alternative consistency philosophy adopted by distributed NoSQL databases when they prioritize availability and performance over strict consistency.

```
BA — Basically Available
S  — Soft state
E  — Eventually consistent
```

Coined by Eric Brewer (who also gave us the CAP theorem) as the counterpoint to ACID.

### Basically Available

The system guarantees availability — it will always respond to a request, even if that response is stale or partial. It won't refuse to respond just because it can't guarantee perfect consistency.

```
During a network partition:
  ACID (CP): "I can't guarantee this data is current — returning error"
  BASE (AP): "Here's the data I have, it might be slightly stale — returning it anyway"

DynamoDB during a partition:
  You ask for a user's shopping cart.
  The primary replica is unreachable.
  DynamoDB returns data from a replica that might be 200ms behind.
  You get a response. The system is available.
```

### Soft State

The state of the system may change over time — even without new input — as updates propagate and nodes synchronize. The system doesn't enforce consistency at every moment; consistency is the responsibility of the application or arrives eventually.

```
Node A: balance = $100  (just processed a debit)
Node B: balance = $150  (hasn't received the update yet)

Both are "correct" in the sense that the system accepts this.
State is soft — it's in flux as replication catches up.
```

### Eventually Consistent

If no new updates are made, all replicas will eventually converge to the same value. "Eventually" is typically milliseconds to seconds in practice.

```
t=0ms:  Alice posts a tweet. Written to replica in us-east-1.
t=50ms: Replication lag — eu-west-1 replica still shows old timeline.
t=100ms: eu-west-1 receives update. Converged.

Bob in London sees Alice's tweet 100ms after she posted it.
That's "eventually consistent" — not real-time, but acceptable for a social feed.
```

**Conflict resolution in eventual consistency:**

When two nodes accept conflicting writes during a partition, the system must resolve them when it heals:

```
Strategy 1: Last-Write-Wins (LWW)
  Each write has a timestamp. The later timestamp wins.
  Risk: clock skew can cause real writes to be overwritten.

Strategy 2: Version vectors
  Track causality. If A→B→C then C supersedes A.
  If A and B are concurrent, surface a conflict to the application.

Strategy 3: CRDTs (Conflict-free Replicated Data Types)
  Data structures that can always be merged without conflicts.
  Example: a counter that only increments — merging is just taking the max of each node's count.

DynamoDB uses Last-Write-Wins.
Cassandra uses Last-Write-Wins by default (with microsecond timestamps).
Riak uses vector clocks and surfaces conflicts to the application.
```

---

## ACID vs BASE — side by side

| Property | ACID | BASE |
|---|---|---|
| Consistency | Strict — constraints always enforced | Eventual — nodes converge over time |
| Availability | May return error during partition | Always returns a response |
| Partition behavior | Refuses inconsistent responses (CP) | Returns possibly-stale data (AP) |
| Performance | Higher latency (coordination overhead) | Lower latency (no cross-node coordination) |
| Scalability | Harder to distribute | Designed for horizontal scale |
| Complexity | DB handles consistency | Application handles conflict resolution |
| Use cases | Finance, inventory, bookings | Social feeds, caches, analytics, preferences |

---

## Choosing between them

```
Choose ACID when:
  □ Money is involved (banking, payments, billing)
  □ Double-booking would be catastrophic (airline seats, hotel rooms)
  □ Referential integrity matters (foreign keys, cascades)
  □ Audit trail accuracy is required
  □ You can't tolerate stale reads

Choose BASE when:
  □ Availability > consistency (social features, feeds, profiles)
  □ You need to scale horizontally across many nodes/regions
  □ Stale data is acceptable for seconds/minutes
  □ Write throughput is extreme (IoT, analytics, logging)
  □ Global distribution is required
```

**Real-world examples:**

| System | Model | Why |
|---|---|---|
| Bank ledger | ACID | Double-spend is catastrophic |
| Inventory reservation | ACID | Overselling is a business problem |
| User profile | BASE | Stale profile data for 1 second is fine |
| Shopping cart | BASE | Amazon proved this — AP cart works |
| Social media feed | BASE | Stale feed is acceptable |
| Order status | ACID (write) + BASE (read) | CQRS: write ACID, read eventual |
| Analytics counters | BASE | HyperLogLog, approximate counts are fine |

---

## The nuance: most systems use both

Modern systems don't pick one globally — they apply the right model per operation:

```
E-commerce platform:
  Payment charge          → ACID (PostgreSQL, Stripe)
  Order record            → ACID (PostgreSQL)
  Product recommendations → BASE (DynamoDB, eventual)
  View counts             → BASE (Redis approximate counter)
  Search index            → BASE (Elasticsearch, eventually consistent)
  Session state           → BASE (Redis, can be lost on crash)
```

CQRS is the formal pattern for this: write side is ACID (normalized DB with transactions), read side is BASE (denormalized read models, eventually consistent).

---

## Interview talking points

!!! tip "Key things to say"
    1. ACID consistency ≠ CAP consistency — different words, same letter, different meaning. ACID = business rule enforcement. CAP = all nodes agree on the same value
    2. Isolation levels are a spectrum — most apps use Read Committed, not Serializable, for performance
    3. BASE doesn't mean "no guarantees" — it means different guarantees optimized for availability
    4. The real question is per-operation: "Does this specific data need to be 100% accurate right now, or can it be eventually consistent?"
    5. Eventually consistent + CQRS is a deliberate architecture choice, not a compromise

## Related topics

- [CAP Theorem](cap-theorem.md) — the partition tolerance trade-off BASE systems make
- [Consistency Models](consistency-models.md) — the spectrum from linearizable to eventual
- [SQL vs NoSQL](../storage/sql-vs-nosql.md) — how ACID vs BASE maps to DB selection
- [CQRS](../patterns/cqrs.md) — using ACID for writes, BASE for reads in the same system
