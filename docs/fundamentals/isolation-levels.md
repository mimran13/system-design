# Database Transactions & Isolation Levels

ACID's "I" — isolation — has surprising depth. Different databases offer different isolation levels with different semantics, and many famous bugs come from picking the wrong one. This page covers the standard isolation levels, the anomalies they prevent (and don't), and the implementation techniques (locking, MVCC) that produce them.

---

## What isolation means

Multiple transactions running concurrently. Isolation defines what each transaction can see of others' in-flight changes.

The strongest isolation makes them appear to run **serially** — one at a time. Weaker levels allow more concurrency but expose anomalies.

```
T1: BEGIN
T1: read A → 100
T2: BEGIN
T2: write A = 200
T2: COMMIT
T1: read A → ?    ← depends on isolation level
```

---

## The four standard isolation levels (SQL)

In ascending strength:

| Level | Dirty Read | Non-Repeatable Read | Phantom Read |
|---|---|---|---|
| Read Uncommitted | Possible | Possible | Possible |
| **Read Committed** | Prevented | Possible | Possible |
| **Repeatable Read** | Prevented | Prevented | Possible |
| **Serializable** | Prevented | Prevented | Prevented |

Most databases default to **Read Committed** (PostgreSQL, Oracle, SQL Server) or **Repeatable Read** (MySQL InnoDB).

---

## Anomaly definitions

### Dirty read

Reading uncommitted data from another transaction:

```
T1: BEGIN
T1: write balance = 0
T2: read balance → 0   (sees uncommitted)
T1: ROLLBACK
T2: now operates on data that "never happened"
```

Prevented at Read Committed and above. Almost no production database allows dirty reads — Read Uncommitted is rarely used.

### Non-repeatable read

Same query in same transaction returns different results:

```
T1: BEGIN
T1: read balance → 100
T2: write balance = 200, COMMIT
T1: read balance → 200   ← different from first read
T1: COMMIT
```

Prevented at Repeatable Read and above.

### Phantom read

A range query returns different rows in the same transaction:

```
T1: BEGIN
T1: SELECT COUNT(*) FROM orders WHERE status = 'pending' → 5
T2: INSERT INTO orders (status) VALUES ('pending'), COMMIT
T1: SELECT COUNT(*) FROM orders WHERE status = 'pending' → 6   ← phantom!
T1: COMMIT
```

The first read found 5 rows; second found 6. The new row is a "phantom" — visible to T1's second read, invisible to its first.

Prevented at Serializable.

---

## Anomalies the SQL standard misses

Real databases — and real bugs — go beyond these three.

### Lost update

```
T1: read balance → 100
T2: read balance → 100
T1: write balance = 100 + 50, COMMIT  → balance = 150
T2: write balance = 100 - 30, COMMIT  → balance = 70   ← T1's update lost
```

Prevented by Repeatable Read in MySQL/PostgreSQL via row locking; not necessarily prevented by the SQL standard's RR definition.

Use `SELECT ... FOR UPDATE` to explicitly lock the row, or use atomic operations:

```sql
UPDATE accounts SET balance = balance + 50 WHERE id = 1;
```

### Write skew

Two transactions read overlapping data, write disjoint data based on what they read:

```
Rule: at least one doctor must be on call.
Currently: Alice and Bob are both on call.

T1: read on_call → [alice, bob]
    sees 2 doctors → safe to remove alice
T2: read on_call → [alice, bob]
    sees 2 doctors → safe to remove bob
T1: UPDATE doctors SET on_call = false WHERE name = 'alice', COMMIT
T2: UPDATE doctors SET on_call = false WHERE name = 'bob', COMMIT

Result: zero doctors on call. Constraint violated.
```

Both transactions read consistent data, both made decisions that were valid given what they saw, but the combined result is inconsistent. Only **Serializable** prevents this.

Postgres uses **Serializable Snapshot Isolation (SSI)** — detects write skew and aborts one of the conflicting transactions.

### Read skew

```
T1: read account_a → 500
T2: BEGIN; transfer 100 from a to b; COMMIT
T1: read account_b → 600   ← sum looks wrong: 500 + 600 = 1100, but it's actually 1000
T1: COMMIT
```

Prevented at Repeatable Read and above (T1 should see consistent snapshot).

---

## Implementation: locking

The classical approach.

| Lock type | Behaviour |
|---|---|
| Shared (S) | Multiple readers can hold; blocks writers |
| Exclusive (X) | Only one writer; blocks all others |
| Range / Gap | Locks a key range to prevent phantoms |

**Two-phase locking (2PL)**:

1. Growing phase: acquire locks
2. Shrinking phase: release locks (typically at commit)

Strict 2PL (release at commit) is the standard implementation of Serializable.

Cost: contention, deadlocks. Slow on workloads with many readers vs. writers competing.

---

## Implementation: MVCC (Multi-Version Concurrency Control)

The modern approach. Used by Postgres, Oracle, MySQL InnoDB, MongoDB WiredTiger, SQL Server (snapshot isolation).

Each row has multiple versions. Each transaction sees a consistent snapshot.

```
Row "account 1":
  Version 1: balance=100, txn_id=10, deleted_by=20
  Version 2: balance=150, txn_id=20, deleted_by=NULL  ← current

T1 (txn_id=15): sees version 1 (created before T1's snapshot, not yet deleted)
T2 (txn_id=25): sees version 2 (created before T2's snapshot, not deleted)
```

Properties:

- **Readers don't block writers, writers don't block readers**
- Reads see a consistent snapshot at transaction start (or statement start, for Read Committed)
- Writes still need locking to prevent lost updates
- Old versions need garbage collection (Postgres VACUUM)

Postgres MVCC + SSI gives you Serializable without lock-based pessimism — usually faster than 2PL.

---

## Snapshot Isolation

Most databases offering "Repeatable Read" actually implement **Snapshot Isolation (SI)**:

- Transaction sees a snapshot of the database at the time it started
- Writes acquire row locks; conflicts cause one transaction to abort
- Phantom reads are prevented because the snapshot doesn't change

But SI **allows write skew** — only Serializable Snapshot Isolation (SSI) prevents it.

| Database | "Repeatable Read" actually means |
|---|---|
| PostgreSQL | Snapshot Isolation |
| MySQL InnoDB | Snapshot Isolation + gap locks (prevents some phantoms) |
| Oracle | Snapshot Isolation |
| SQL Server | Locking-based by default; SI is opt-in |

| Database | Serializable means |
|---|---|
| PostgreSQL | SSI (predicate-based, may abort) |
| MySQL InnoDB | 2PL with gap locks |
| Oracle | Older versions: same as SI; newer: stricter |

Read your database's docs; "Repeatable Read" is not standardised in practice.

---

## Choosing an isolation level

```
Read Committed: fastest, default for most apps
  - Acceptable for: dashboards, analytics, most CRUD
  - Not acceptable for: financial logic with read-then-write

Repeatable Read / Snapshot Isolation:
  - Use when transactions read same data multiple times
  - Use when you want consistent reads across a transaction
  - Beware: write skew possible

Serializable / SSI:
  - Use when correctness depends on absence of concurrent anomalies
  - Bookings, financial transfers, inventory with constraint
  - Cost: more aborts → app must retry transactions
```

Common pattern in high-performance systems: **Read Committed by default**, **Serializable for known-tricky transactions**, **explicit locking** (`SELECT FOR UPDATE`) where appropriate.

---

## Optimistic vs pessimistic concurrency

### Pessimistic

Acquire locks before reading/writing. Block other transactions.

```sql
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;  -- holds X lock
UPDATE accounts SET balance = balance + 100 WHERE id = 1;
COMMIT;
```

Use when contention is high.

### Optimistic

Don't lock. Check at commit whether something conflicting happened; abort if so.

```sql
-- Read with version
SELECT balance, version FROM accounts WHERE id = 1;
-- balance=100, version=5

-- Write with version check
UPDATE accounts
SET balance = 150, version = version + 1
WHERE id = 1 AND version = 5;
-- 0 rows affected → someone else updated; retry
```

Or use SSI / SI which abort on conflict automatically.

Use when contention is low — most reads succeed without retry.

---

## Distributed transactions

The above describes single-node. Distributed transactions span multiple databases / shards / services.

### Two-phase commit (2PC)

Coordinator asks all participants "can you commit?"; if all say yes, commits. Slow, blocking on coordinator failure.

### Saga pattern

Sequence of local transactions with compensating actions on failure.

### Spanner-style

Use synchronised clocks (TrueTime) to provide global serializable snapshots without 2PC.

These deserve their own pages — see [Distributed Transactions](../distributed/distributed-transactions.md), [Two-Phase Commit](../distributed/two-phase-commit.md), [Saga Pattern](../patterns/saga-pattern.md).

---

## Database-specific notes

### PostgreSQL

- Default: Read Committed
- MVCC throughout
- `SERIALIZABLE` uses SSI — modern, performant; expect some aborts
- `SELECT ... FOR UPDATE` for explicit row locking

### MySQL InnoDB

- Default: Repeatable Read (with phantom prevention via gap locks)
- MVCC + locking hybrid
- `SELECT ... FOR UPDATE` and `SELECT ... LOCK IN SHARE MODE`

### Oracle

- Default: Read Committed
- MVCC
- "Serializable" is actually SI (allows write skew)
- `SELECT ... FOR UPDATE` for locking

### SQL Server

- Default: Read Committed (locking-based)
- `READ_COMMITTED_SNAPSHOT` opt-in for MVCC
- `SNAPSHOT` and `SERIALIZABLE` available

### MongoDB

- Single-document operations: atomic
- Multi-document transactions: snapshot isolation
- Causal consistency available

### Cassandra

- No transactions in the SQL sense
- Lightweight transactions (LWT) via Paxos for compare-and-set on a single partition
- Eventual consistency by default

---

## Common bugs

| Symptom | Cause |
|---|---|
| Race condition in counter increments | Read-then-write without lock or atomic op |
| Negative balances | Read/check/write across transactions without serializable isolation |
| Double-spending | Concurrent updates without optimistic version check |
| Constraint violations under load | Write skew at SI level; need Serializable |
| Deadlocks | Locks acquired in different orders by different transactions |
| Mysterious slowdowns | Long-running transactions blocking VACUUM or causing replica lag |

Specific to MVCC databases:

- **Long transactions** prevent VACUUM, bloat tables, slow scans
- **Stale snapshots** can read data from minutes/hours ago — not always desirable

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you understand isolation as a tradeoff curve, not just "use Serializable for safety."

**Strong answer pattern:**
1. Four standard levels prevent: dirty read, non-repeatable read, phantom read, plus Serializable for write skew
2. Most "Repeatable Read" in practice = Snapshot Isolation (allows write skew)
3. MVCC = readers don't block writers; the modern default
4. Pick Read Committed for normal CRUD, Serializable for known-tricky transactions, explicit locks where needed
5. Distributed transactions are a different beast — sagas, 2PC, Spanner

**Common follow-up:** *"What is write skew, and which isolation level prevents it?"*
> Two transactions read overlapping data, then write disjoint changes that are individually valid but jointly violate a constraint. Classic example: doctors-on-call rule where each transaction independently decides it's safe to remove a doctor. Snapshot Isolation (often labeled "Repeatable Read") allows this because each transaction sees a consistent snapshot but doesn't detect that the other modified data the snapshot was based on. Only Serializable (true serializable, like Postgres SSI) prevents it.

---

## Related topics

- [ACID vs BASE](acid-vs-base.md) — the I in ACID
- [Consistency Models](consistency-models.md) — closely related; consistency models extend isolation to distributed systems
- [Concurrency & Locking](concurrency.md) — primitives behind isolation
- [Distributed Transactions](../distributed/distributed-transactions.md) — distributed extension
- [Relational Databases](../storage/relational-databases.md) — where these levels are implemented
