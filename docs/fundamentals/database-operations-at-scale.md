---
tags:
  - applied
---

# Database Operations at Scale

Running a database in production is a different discipline from designing one. This page covers the operational reality: online schema migrations, index management, connection pooling beyond basics, backups that actually work, capacity planning, and the recurring patterns that turn 3am pages into 9am cron jobs.

For *internals* (planner, MVCC, vacuum), see [Database Internals Deep-Dive](database-internals-deep-dive.md). This page focuses on **operating** at scale.

---

## Online schema migrations

The default `ALTER TABLE` is dangerous. Knowing which operations are safe vs blocking under load is essential staff-level knowledge.

### Postgres: lock impact of common ALTERs

| Operation | Lock acquired | Safe under load? |
|---|---|---|
| `ADD COLUMN` (no default) | `ACCESS EXCLUSIVE` brief | ✓ instant (since Postgres 11) |
| `ADD COLUMN ... DEFAULT 'value'` | `ACCESS EXCLUSIVE` brief | ✓ instant (since Postgres 11; immutable default) |
| `ADD COLUMN ... DEFAULT volatile_func()` | `ACCESS EXCLUSIVE` long | ✗ rewrites table |
| `ADD COLUMN ... NOT NULL` (no default) | `ACCESS EXCLUSIVE` long | ✗ scans whole table |
| `DROP COLUMN` | `ACCESS EXCLUSIVE` brief | ✓ instant (marks as dropped) |
| `RENAME COLUMN` | `ACCESS EXCLUSIVE` brief | ✓ instant |
| `ALTER COLUMN TYPE` (compatible) | `ACCESS EXCLUSIVE` brief | ✓ if no rewrite needed |
| `ALTER COLUMN TYPE` (rewrite) | `ACCESS EXCLUSIVE` long | ✗ rewrites table |
| `ADD CONSTRAINT NOT NULL` | `ACCESS EXCLUSIVE` long | ✗ scans whole table |
| `ADD CONSTRAINT NOT NULL ... NOT VALID` | `ACCESS EXCLUSIVE` brief | ✓ instant |
| `VALIDATE CONSTRAINT` | `SHARE UPDATE EXCLUSIVE` | ✓ allows reads/writes |
| `CREATE INDEX` | `SHARE` | ✗ blocks writes |
| `CREATE INDEX CONCURRENTLY` | `SHARE UPDATE EXCLUSIVE` | ✓ slow but safe |
| `DROP INDEX` | `ACCESS EXCLUSIVE` brief | ✓ if not in use |
| `DROP INDEX CONCURRENTLY` | `SHARE UPDATE EXCLUSIVE` | ✓ always preferred |
| `ALTER TABLE ... SET (autovacuum_...)` | `SHARE UPDATE EXCLUSIVE` | ✓ |
| `ADD FOREIGN KEY` | `SHARE ROW EXCLUSIVE` | ✗ blocks writes during validation |
| `ADD FOREIGN KEY ... NOT VALID` | `SHARE ROW EXCLUSIVE` brief | ✓ |
| `VACUUM FULL` | `ACCESS EXCLUSIVE` long | ✗ never on hot tables |
| `REINDEX` (non-concurrent) | `SHARE` | ✗ blocks writes |
| `REINDEX CONCURRENTLY` | `SHARE UPDATE EXCLUSIVE` | ✓ |

**The pattern**: anything labeled `ACCESS EXCLUSIVE long` is a production-stop. Always use the `CONCURRENTLY` / `NOT VALID` variants.

### Safe migration patterns

**Adding a NOT NULL column with default**:

```sql
-- BAD: blocks for minutes/hours on large table
ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- GOOD: multi-step
-- Step 1: Add column nullable
ALTER TABLE orders ADD COLUMN status TEXT;

-- Step 2: Set default (instant in PG 11+)
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending';

-- Step 3: Backfill existing rows in batches (no lock)
UPDATE orders SET status = 'pending'
WHERE status IS NULL AND id IN (
  SELECT id FROM orders WHERE status IS NULL LIMIT 10000
);
-- Repeat in a loop until 0 rows affected

-- Step 4: Add NOT NULL via CHECK + VALIDATE (no full-table lock)
ALTER TABLE orders ADD CONSTRAINT orders_status_not_null
  CHECK (status IS NOT NULL) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_status_not_null;
```

**Renaming a column**:

```sql
-- A rename is "instant" lock-wise but breaks applications mid-deploy.
-- Multi-deploy pattern:

-- Phase 1: Add new column; dual-write
ALTER TABLE orders ADD COLUMN user_uuid UUID;
-- Application now writes both user_id and user_uuid

-- Phase 2: Backfill historical data in batches

-- Phase 3: Application reads from new column

-- Phase 4: Drop old column (after retention period)
ALTER TABLE orders DROP COLUMN user_id;
```

**Changing column type**:

```sql
-- BAD: rewrites table
ALTER TABLE orders ALTER COLUMN amount TYPE BIGINT;

-- GOOD: add new column, migrate, swap
ALTER TABLE orders ADD COLUMN amount_v2 BIGINT;
-- Backfill in batches
-- Application dual-writes
-- Application reads from new
-- Drop old

-- OR: use views to swap (zero-downtime)
```

### Tooling for online migrations

**Postgres**:

- **`pg_repack`** — table rewrite without exclusive lock (better than `VACUUM FULL`)
- **`pgroll`** — schema changes with zero-downtime + reversibility
- **`pg-osc`** — Percona-style online schema change
- **Liquibase / Flyway** — migration orchestration (apply changes you write)

**MySQL**:

- **`gh-ost`** (GitHub's tool; uses binlog replication) — safe online ALTER for InnoDB
- **`pt-online-schema-change`** (Percona Toolkit; uses triggers) — older but battle-tested
- **MySQL 8.0+ instant DDL** — many ALTERs are now instant natively

**Cloud-managed**:

- **PlanetScale** — branching + non-blocking schema changes built-in
- **Aurora** — supports `FAST DDL` for many operations
- **CockroachDB / Spanner** — schema changes designed to be online from day 1

### Migration safety checklist

```
Before every migration:
  ☐ Tested in staging with realistic data volume?
  ☐ EXPLAIN shows the impact at expected scale?
  ☐ Lock duration estimated (test on copy of prod data)?
  ☐ Rollback path defined?
  ☐ Monitoring dashboard ready (lock waits, replication lag)?
  ☐ Maintenance window or off-peak scheduling?
  ☐ Pre-deploy: connections to DB throttled to prevent timeouts?
  ☐ Lock timeout set: `SET lock_timeout = '5s'` so failed ALTER doesn't hang forever
```

The single best practice: **`SET lock_timeout = '5s'`** before any ALTER. Better to fail and retry than to block traffic for minutes.

---

## Index management

Indexes are the highest-leverage performance tool and the easiest to misuse.

### When to create an index

```
Signals an index is needed:
  ✓ Query takes >100ms and EXPLAIN shows Seq Scan
  ✓ Filter / join column has high selectivity (returns <5% of rows)
  ✓ ORDER BY a column without an index → external sort spilling to disk
  ✓ Foreign keys without indexes → slow DELETE on parent
```

### Index types — when each fits

```
B-tree (default):
  ✓ Equality, range, ORDER BY, NULLs
  ✓ Most common use case
  ✓ Use for: WHERE col = ?, WHERE col > ?, ORDER BY col

Hash:
  ✓ Equality only
  ✓ Slightly faster than B-tree for pure =
  ✗ No range queries, no ORDER BY
  Rarely worth using over B-tree

GIN (Generalized Inverted Index):
  ✓ Arrays, JSONB, full-text search
  ✓ Use for: WHERE data @> '{key: value}'

GiST:
  ✓ Geometric, range types, full-text alternatives
  ✓ Use for: geographic queries, custom data types

BRIN (Block Range INdex):
  ✓ Very large tables with naturally ordered data (time-series)
  ✓ Tiny index size; coarse lookups
  ✓ Use for: WHERE timestamp > X on a time-ordered table

Bloom (extension):
  ✓ Multi-column "any of these match" lookups
  ✓ Trade space for false-positive-friendly queries
```

### Composite indexes — column order matters

```sql
-- Index on (user_id, status)
CREATE INDEX ON orders (user_id, status);

-- Queries that use this index efficiently:
WHERE user_id = ?                       -- ✓ left-anchored
WHERE user_id = ? AND status = ?        -- ✓ both columns
WHERE user_id = ? ORDER BY status       -- ✓ sort uses index

-- Queries that DON'T use this index efficiently:
WHERE status = ?                        -- ✗ left column not used → seq scan
WHERE status = ? AND user_id = ?        -- ✓ planner reorders; works
```

**Rule of thumb**: put the most-selective column first, unless you also need to scan ranges of it.

### Partial indexes

For when most rows don't need indexing:

```sql
-- Only index "active" rows (most are deleted/archived)
CREATE INDEX orders_active_idx ON orders (user_id) 
WHERE status IN ('pending', 'confirmed');

-- Massive space savings if 95% of orders are 'completed'/'cancelled'
```

### Covering indexes (INCLUDE)

When the query selects more columns than just the filter:

```sql
-- Without INCLUDE: index hit, then table fetch for the SELECT columns
SELECT name, email FROM users WHERE user_id = 'u1';

-- With INCLUDE: index has the columns; no table fetch needed
CREATE INDEX users_uid_covering 
ON users (user_id) INCLUDE (name, email);

-- Query plan: Index Only Scan (no heap access) → faster
```

### Finding unused indexes

```sql
-- Postgres: indexes never used since stats reset
SELECT 
  schemaname, relname AS table_name,
  indexrelname AS index_name,
  idx_scan, idx_tup_read,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'   -- exclude primary keys
ORDER BY pg_relation_size(indexrelid) DESC;
```

Dropping unused indexes frees space and speeds up writes (every INSERT/UPDATE maintains all indexes).

**Caution**: stats reset on Postgres restart. If the table just started getting queried for analytics monthly, idx_scan=0 may be misleading. Look at long-term stats.

### Index maintenance costs

```
Every INSERT:  must update all indexes on the table
Every UPDATE:  must update indexes for changed columns
                + index of unchanged columns if HOT update fails
                  (HOT = Heap-Only Tuple; PG keeps unchanged-index UPDATEs on same page)
Every DELETE:  marks the index entry for cleanup
```

For write-heavy tables, **too many indexes slows writes significantly**. Audit periodically.

### Index bloat

Like tables, indexes accumulate dead entries. They get bigger than needed.

```sql
-- Rebuild index without long lock
REINDEX INDEX CONCURRENTLY orders_user_id_idx;

-- Or rebuild all indexes on a table
REINDEX TABLE CONCURRENTLY orders;
```

`pg_repack` also handles indexes. Schedule periodic reindexing for high-write tables.

---

## Backup strategies

A backup you haven't tested is hope, not strategy.

### Physical vs logical

```
Physical (full disk-level snapshot):
  ✓ Fast to take (cloud snapshots ~minutes)
  ✓ Fast to restore (clone the volume)
  ✓ Includes everything: indexes, vacuum state, statistics
  ✗ Restored DB must match major version exactly
  ✗ Can't restore a subset of data easily

Logical (pg_dump / mysqldump):
  ✓ Portable across versions
  ✓ Can restore selectively (single table)
  ✓ Smaller backup files
  ✗ Slow on large databases (hours)
  ✗ Restore requires rebuilding indexes
```

For production: **both**. Physical snapshots for fast disaster recovery; logical for portable / partial restores.

### Point-in-time recovery (PITR)

```
Base backup at 02:00 UTC (last night)
+ WAL stream archived continuously
= Restore to any second since 02:00 UTC
```

Setup (Postgres):

```sql
-- Archive WAL segments to S3
ALTER SYSTEM SET archive_mode = 'on';
ALTER SYSTEM SET archive_command = 'aws s3 cp %p s3://my-wal-bucket/%f';
```

Then `pg_basebackup` to S3 daily. Combined: restore to any moment in time within the WAL retention period.

**Use for**: "I dropped the wrong table at 14:32 UTC; restore to 14:31."

### Backup retention policy

```
Hot (immediate restore): 7 days
Warm (slower restore):   30 days
Archive (compliance):    1-7 years (varies; encrypted, immutable, separate region)
```

**Off-site / different account**: backups must survive an attacker who compromised your main account. Either separate cloud account or different cloud provider.

### Restore drills

```
Weekly:    automated restore test to a separate DB; validates backup integrity
Monthly:   manual full restore by on-call engineer
Quarterly: documented disaster scenario (e.g., "us-east-1 is gone")
```

Without drills, backups are theoretical. The first time you'll find out they don't work is when you need them.

### Cloud-managed backup services

```
AWS RDS:     Automated daily snapshots; PITR up to 35 days
Aurora:      Continuous backup; PITR to any second within retention
Cloud SQL:   Similar to RDS
DynamoDB:    PITR for 35 days; on-demand backups (longer retention)
```

Use the managed service's backup features. Add an additional layer (logical dump to S3 in a different account) for defence in depth.

---

## Connection pooling deeper

The simple version: "use PgBouncer in transaction mode." The deeper version:

### Pool sizing math

```
Postgres max_connections = 200 (typical default for small instance)
  → 10 reserved for superuser / replication
  → ~190 available

Each backend uses ~10-20 MB of RAM
  → 190 backends × 15 MB = ~2.8 GB
  → on an 8 GB instance, that's 35% of RAM just for idle backends

PgBouncer's pool_size = how many backends per database
PgBouncer is essentially free; you can run many instances
```

Right-sizing:

```
Calculate active connections needed = peak QPS × avg query latency
  
  Example: 10K QPS × 5ms = 50 concurrent queries on average
  Plus headroom for spikes: ~100 backends
  
Run pg_bouncer with pool_size = 100
Application can have thousands of connections to PgBouncer
PgBouncer multiplexes onto 100 Postgres backends
```

The rule: **app-to-pgbouncer = unlimited; pgbouncer-to-postgres = sized to what backend can handle**.

### Pool modes (review)

```
Session mode:     1 app connection : 1 Postgres backend, kept until disconnect
                  Use when: LISTEN/NOTIFY, prepared statements, advisory locks
                  
Transaction mode: backend assigned per transaction (BEGIN..COMMIT)
                  Use when: typical web app
                  Caveats:  prepared statements (without explicit DEALLOCATE), 
                            SET commands, advisory locks won't work as expected

Statement mode:   backend per statement
                  Use when: ad-hoc / scripts
                  Caveats:  cannot use transactions
```

Default to transaction mode. Configure your app to commit/rollback every operation.

### Common pool misconfigurations

```
✗ App and pgbouncer pool sizes equal → defeats pooling
✗ pgbouncer max_client_conn too low → app gets connection errors
✗ pool_size too high → Postgres becomes bottleneck (too many backends)
✗ pool_size too low → app contention waiting for pool
✗ idle_transaction_timeout in app not set → leaks
✗ pool per-database when multi-tenant per-schema → suboptimal
```

### Multi-tenant pool design

```
Option A: one shared pool for all tenants
  Pro: simple
  Con: noisy tenant can exhaust pool

Option B: per-tenant pool
  Pro: isolation
  Con: pool overhead × N tenants

Option C: tiered pools (free / paid)
  Pro: isolation where it matters
  Con: complexity
```

Most SaaS converges on B or C as scale grows.

### Beyond pgbouncer

```
pgcat:     newer; native sharding support; transaction-level
Odyssey:   Yandex's; supports more PG features
PgPool-II: more features (load balancing, replication); also more complex
```

For most cases: pgbouncer is fine. Consider alternatives if you need their specific features.

---

## Failover and high availability

### Replication topologies

```
Primary + 1 sync replica (HA basic):
  Synchronous replication; commit waits for replica ack
  Higher write latency; survives 1 node failure

Primary + N async replicas:
  Standard pattern; reads can go to replicas
  Async: replica may lag; possible data loss on primary failure

Primary + 1 sync + N async replicas:
  Best of both; common at scale
```

### Automatic failover

```
Tools:
  Patroni:        most popular; uses etcd/Consul/ZooKeeper for consensus
  RepMgr:         simpler; less feature-rich
  pg_auto_failover: from Citus Data
  AWS RDS Multi-AZ: managed; failover ~30-60s
  Aurora:          managed; failover <30s typically
```

### Manual failover process

For maintenance (OS upgrade, version bump):

```
1. Pause writes (or accept brief downtime)
2. Wait for replica to catch up (zero lag)
3. Promote replica to primary
4. Update connection strings (or use a router that does)
5. Old primary becomes new replica when it comes back
```

For unplanned failover (primary unreachable):

```
1. Confirm primary really down (not just network split — split brain risk)
2. Promote a replica
3. Fence the old primary (prevent zombie writes)
4. Reroute clients
5. Investigate; bring old primary back as replica
```

### Failover gotchas

```
Split brain:
  Network partition → replica thinks primary is down → promotes itself
  Old primary still accepting writes → two primaries → data divergence
  
Solution: fencing tokens, quorum-based promotion, STONITH (Shoot The Other Node In The Head)

Replica lag at failover:
  If replica is 5 min behind primary, you lose 5 min of writes on failover
  
Solution: sync replicas (commit waits), or accept the data loss

Connection routing:
  Apps need to find the new primary
  Solutions: DNS update (slow), HAProxy with health checks, pgbouncer redirect, 
             cloud RDS endpoints (automatic)

Read replica promoted, but applications still write to old primary's address:
  Stale connections, mysterious errors
  
Solution: explicit conn failover in driver; or proxy layer
```

---

## Vacuum operations playbook

Following from [Database Internals](database-internals-deep-dive.md):

### Daily monitoring queries

```sql
-- Top 10 bloated tables
SELECT 
  schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size,
  n_live_tup, n_dead_tup,
  round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS pct_dead
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
LIMIT 10;

-- Tables that haven't been vacuumed recently
SELECT schemaname, tablename, last_autovacuum, n_dead_tup
FROM pg_stat_user_tables
WHERE last_autovacuum < NOW() - INTERVAL '1 day'
  AND n_dead_tup > 1000
ORDER BY last_autovacuum NULLS FIRST;

-- Long-running queries blocking vacuum
SELECT 
  pid, now() - xact_start AS age, state, query
FROM pg_stat_activity 
WHERE xact_start IS NOT NULL
  AND now() - xact_start > INTERVAL '10 minutes'
ORDER BY xact_start;
```

### Vacuum tuning per table

```sql
-- Aggressive autovacuum for hot, write-heavy table
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor = 0.05,        -- vacuum at 5% bloat
  autovacuum_vacuum_threshold = 100,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_cost_limit = 5000           -- more I/O budget
);

-- Disable autovacuum for tables with controlled load patterns
ALTER TABLE archived_logs SET (autovacuum_enabled = false);
-- Run manual VACUUM during maintenance windows
```

### When to do VACUUM FULL (rare)

```
Pre-conditions:
  ✓ Massive bloat (>50%)
  ✓ Free disk space ≥ 1.5× table size (needs to rebuild)
  ✓ Tolerance for ACCESS EXCLUSIVE lock for duration of rebuild
  ✓ Off-peak / maintenance window
```

In production with traffic: use `pg_repack` instead.

---

## Capacity planning for databases

### CPU sizing

```
Rule of thumb: 
  Postgres backend uses ~1 core for active workload
  Plus background processes (autovacuum, checkpointer, wal writer)
  
For 100 concurrent active queries: 8-16 cores typically
For high write workloads: more cores help (parallel checkpoint)
For read-heavy: more replicas (each with own cores) better than bigger primary
```

### Memory sizing

```
shared_buffers:        25% of RAM (standard rule)
work_mem:              4MB to 64MB per query operation
maintenance_work_mem:  256MB-1GB (for VACUUM, CREATE INDEX)
effective_cache_size:  60-75% of RAM (planner uses this to estimate cache)

Connection memory:     ~10-20MB per backend
                       at 200 backends: 2-4GB just for connections
```

### Storage sizing

```
Estimate growth:
  Current size + (writes/day × avg row size × replication factor) × retention

Add overhead:
  Indexes: 30-50% of table size
  Bloat headroom: 30%
  WAL: keep ~10-50GB available

Plus:
  Backup space (sometimes on same volume)
  Recovery space (PITR replay)
```

Always size for **30-50% free space** at minimum. Postgres performance degrades sharply when disks fill above 80%.

### IOPS sizing

```
For an OLTP workload:
  Estimate: writes_per_sec × ~5 IO ops per write (data + WAL + indexes)
  At 5K writes/sec: 25K IOPS
  
Cloud disk IOPS:
  AWS gp3:  3K-16K IOPS, configurable
  AWS io2:  up to 256K IOPS, more expensive
  Local NVMe: 100K-1M+ IOPS, instance-attached
  
If you need >50K IOPS sustained, consider:
  io2 / io2 Block Express
  Local NVMe (with replication for durability)
  Multiple smaller DBs (sharding)
```

---

## Common production scenarios

### Scenario: "Database is full"

```
Step 1: Check what's filling disk
  SELECT pg_size_pretty(pg_total_relation_size(t.oid))
  FROM pg_class t
  ORDER BY pg_total_relation_size(t.oid) DESC LIMIT 20;

Step 2: Common culprits
  - Bloat (high n_dead_tup): vacuum / pg_repack
  - WAL accumulated (stale replication slot): drop the slot
  - Audit / log tables grew unbounded: archive + drop
  - Index bloat: REINDEX CONCURRENTLY

Step 3: Emergency room
  - DELETE large unused tables (but vacuum after, doesn't reclaim disk!)
  - DROP unused indexes
  - VACUUM FULL only as last resort (locks!)
  - Expand the volume if cloud-managed
```

### Scenario: "Replica lag growing"

```
Step 1: Why?
  - Replica CPU saturated?
  - Replica disk slow (different than primary)?
  - Replica blocked by long query? (hot_standby_feedback issues)
  - Network bandwidth saturated?

Step 2: Mitigate
  - Kill long queries on replica
  - Promote bigger replica
  - Disable hot_standby_feedback (allows replica to fall behind to clean up bloat)
  - Increase max_standby_streaming_delay
```

### Scenario: "Connections exhausted"

```
Step 1: Where are they?
  SELECT state, count(*) FROM pg_stat_activity GROUP BY state;

Step 2: Common patterns
  - Many "idle in transaction": app not committing
  - Many "active" with old query_start: queries stuck on locks
  - Connections leak: pool config wrong

Step 3: Emergency
  - Kill idle-in-transaction > 5 min:
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE state = 'idle in transaction' AND state_change < NOW() - INTERVAL '5 min';
  - Restart pgbouncer (kills all connections; brief outage)
  - Increase max_connections (last resort; needs restart)
```

### Scenario: "Mystery slow query that ran fine yesterday"

```
Step 1: Get the plan now vs yesterday
  EXPLAIN ANALYZE current query
  Compare to historical (auto_explain logs?)

Step 2: Common causes
  - Statistics changed: ANALYZE the table
  - Index bloat: REINDEX CONCURRENTLY
  - Buffer pool cold: wait for warmup
  - Vacuum needed: check pg_stat_user_tables
  - New data introduced cardinality changes: pg_stats inspection
```

---

## Observability essentials

```yaml
Extensions to enable from day 1:
  - pg_stat_statements         # query stats
  - auto_explain               # auto-log slow queries
  - pg_buffercache              # what's in the buffer pool
  - pg_stat_io (PG 16+)         # I/O patterns

Logs to capture:
  - log_min_duration_statement = 1000    # log queries > 1s
  - log_lock_waits = on                  # log waits > deadlock_timeout
  - log_temp_files = 10240               # log temp file usage > 10MB
  - log_checkpoints = on
  - log_autovacuum_min_duration = 1000   # log autovacuum > 1s

Metrics to dashboard:
  - Transactions/sec (commits + rollbacks)
  - Active connections / max_connections
  - Buffer hit ratio (>99% target)
  - Replication lag (if applicable)
  - Lock waits / sec
  - Autovacuum activity
  - Disk usage / IOPS
  - WAL generation rate
  - Top queries by total_time
```

Monitoring stack:
- **Datadog Database Monitoring** — managed, comprehensive
- **pganalyze** — Postgres-specific deep insights
- **pgwatch2** — open-source Postgres monitoring
- **Prometheus + postgres_exporter** — DIY option

---

## Anti-patterns

| Anti-pattern | Better |
|---|---|
| `ALTER TABLE ADD COLUMN NOT NULL DEFAULT volatile()` | Multi-step staged migration |
| `CREATE INDEX` (without CONCURRENTLY) on production | Always CONCURRENTLY |
| No backup testing | Weekly automated restore tests |
| No PITR setup | Configure WAL archive from day 1 |
| Single database instance with no replicas | Multi-AZ + read replicas |
| `max_connections` set high to "handle scale" | Connection pooler + reasonable limit |
| Vacuum disabled because "it's slow" | Tune autovacuum aggressively; fix bloat source |
| No statement-level timeouts | Set `statement_timeout` per role / per database |
| `idle_in_transaction_session_timeout` unset | Set to 30s-5min to kill leaks |
| `VACUUM FULL` during traffic | `pg_repack` instead |

---

## Quick reference

```
"How to safely ADD COLUMN":      multi-step pattern with NOT VALID + VALIDATE
"How to CREATE INDEX":           always CONCURRENTLY
"How to handle bloat":           pg_repack, never VACUUM FULL live
"How to find slow queries":      pg_stat_statements
"How to PITR":                   WAL archive + base backup
"How many connections":          calculate; pool with pgbouncer transaction mode
"When to use read replicas":     read scaling, analytics, HA
"How to monitor health":         transactions/sec, connections, buffer hit, replication lag
"Migration safety":              SET lock_timeout = '5s' before every ALTER
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you've actually operated a database in production with non-trivial load.

**Strong answer pattern:**
1. Schema migrations: multi-step, never blocking; use CONCURRENTLY
2. Index management: audit unused, watch bloat, drop with care
3. Backups: physical + logical; PITR; tested restores
4. Connection pooling: pgbouncer transaction mode; size deliberately
5. Vacuum: tune per-table; monitor for long transactions blocking it
6. Failover: tested via game days; handle split brain

**Common follow-up:** *"You need to add a NOT NULL column to a 1TB table without downtime. How?"*
> Multi-step. (1) Add the column nullable: ALTER TABLE ADD COLUMN — instant on Postgres 11+. (2) Set the default: ALTER COLUMN SET DEFAULT — also instant. (3) Application starts writing the column on all new inserts/updates. (4) Backfill historical rows in batches with `UPDATE ... WHERE col IS NULL LIMIT 10000`, throttled to avoid replication lag. (5) Once all rows have a value, add a CHECK constraint with NOT VALID: instant. (6) VALIDATE CONSTRAINT, which scans but only takes SHARE UPDATE EXCLUSIVE — allows reads and writes. The whole process takes hours-days but no user-visible downtime. The naive `ADD COLUMN NOT NULL` would lock the table for the full duration of the backfill.

---

## Related

- [Database Internals Deep-Dive](database-internals-deep-dive.md) — what's underneath
- [Database Indexes](database-indexes.md) — index types and usage
- [Connection Pooling](../patterns/connection-pooling.md) — pooling theory
- [Replication](../patterns/replication.md) — async / sync details
- [Sharding Best Practices](../patterns/sharding-best-practices.md) — when one box isn't enough
- [Incident Response Craft](../observability/incident-response-craft.md) — handling DB incidents
- [Performance Engineering Discipline](../observability/performance-engineering.md) — broader perf practice
