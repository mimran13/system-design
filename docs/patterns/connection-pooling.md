# Connection Pooling

## What it is

A connection pool maintains a set of pre-established database connections that are reused across requests. Instead of opening and closing a connection for every query, the application borrows a connection from the pool, uses it, and returns it.

```
Without connection pooling:
  Request 1: open TCP connection → authenticate → query → close connection
  Request 2: open TCP connection → authenticate → query → close connection
  ...
  
  Each connection: ~50ms overhead (TCP handshake + TLS + DB auth)
  At 1,000 req/sec: 1,000 × 50ms = 50 seconds of connection overhead/sec
  → Impossible

With connection pooling:
  Startup: open 20 connections, keep them alive
  
  Request 1: borrow connection from pool → query (1ms) → return to pool
  Request 2: borrow connection from pool → query (1ms) → return to pool
  
  Connection overhead: ~0 (connections already open)
  Pool of 20 handles thousands of requests/sec
```

---

## Why databases limit connections

Databases aren't infinitely scalable in connection count:

```
PostgreSQL default: max_connections = 100
Each connection consumes:
  ~5–10MB RAM for connection state
  1 backend process (or thread on MySQL)

100 connections × 10MB = 1GB RAM just for connection overhead
→ Eating into memory that could be used for buffer cache
→ Buffer cache is what keeps frequently-read data in RAM

Rule: fewer connections = more memory for cache = faster queries

PostgreSQL recommendation: keep connections ≤ 2× CPU cores
For a 4-core DB server: ~8–16 active connections is optimal
```

This is the paradox: your app has 50 servers × 20 threads = 1,000 potential connections, but the DB performs best with ~16. Connection pooling solves this by multiplexing.

---

## Application-level pooling

Every database driver ships with a built-in pool. This is the first layer.

```python
# SQLAlchemy (Python) — application-level pool
from sqlalchemy import create_engine

engine = create_engine(
    "postgresql://user:pass@localhost:5432/mydb",
    pool_size=10,          # keep 10 connections open at all times
    max_overflow=5,        # allow up to 5 extra during bursts (total: 15)
    pool_timeout=30,       # wait up to 30s for a connection before raising
    pool_recycle=1800,     # recycle connections every 30 min (avoids stale)
    pool_pre_ping=True,    # test connection before use (detects dead connections)
)

# Each app server process has its own pool:
# 10 app servers × 10 connections = 100 connections to DB
# This is already at the PostgreSQL limit — and we haven't added overflow yet
```

```java
// HikariCP (Java) — fastest connection pool for JVM
HikariConfig config = new HikariConfig();
config.setJdbcUrl("jdbc:postgresql://localhost:5432/mydb");
config.setUsername("user");
config.setPassword("pass");
config.setMaximumPoolSize(10);          // max connections per pool
config.setMinimumIdle(5);              // keep at least 5 open always
config.setConnectionTimeout(30_000);   // 30s timeout waiting for connection
config.setIdleTimeout(600_000);        // close idle connections after 10 min
config.setMaxLifetime(1_800_000);      // replace connections after 30 min

HikariDataSource dataSource = new HikariDataSource(config);
```

---

## The scale problem: too many app servers

Application-level pools work well for a few servers. They break down when you scale out:

```
Problem:
  50 app servers × 10 connections each = 500 DB connections
  100 app servers × 10 connections each = 1,000 DB connections
  
  PostgreSQL default max_connections = 100
  → You've already exceeded it with 50 servers

  Even if you raise max_connections:
  1,000 connections × 10MB = 10GB RAM consumed by connections
  → Leaves less RAM for buffer cache → slower queries
```

The solution: a **server-side connection pooler** that sits between your app servers and the database.

---

## PgBouncer: server-side pooler for PostgreSQL

PgBouncer multiplexes thousands of app connections into a small number of real database connections:

```
50 app servers × 20 connections = 1,000 app connections
         │
         ▼
    PgBouncer
    (multiplexes)
         │
         ▼
    PostgreSQL
    10–20 real connections
```

```ini
# pgbouncer.ini
[databases]
mydb = host=127.0.0.1 port=5432 dbname=mydb

[pgbouncer]
listen_port = 6432
listen_addr = *
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

# Pool mode — the critical setting
pool_mode = transaction    # ← recommended for most apps

# Max connections to PostgreSQL (the real DB)
server_pool_size = 20      # 20 real connections to PostgreSQL

# Max client connections (from app servers)
max_client_conn = 1000     # accept up to 1000 app connections

# App server pool size per user/database
default_pool_size = 20
```

### Pool modes

PgBouncer has three modes — choosing the wrong one is a common mistake:

```
session mode:
  App connection holds a real DB connection for its entire lifetime.
  1:1 mapping — no real multiplexing.
  Use when: your app holds connections open permanently (legacy apps).
  Problem: no savings on connection count.

transaction mode (recommended):
  Real DB connection is allocated for the duration of a transaction,
  then returned to pool. App can hold client connection without
  holding a DB connection.
  
  Works for 99% of modern apps.
  Does NOT support: SET, advisory locks, LISTEN/NOTIFY (session-scoped)

statement mode:
  Real DB connection returned to pool after each statement.
  Most aggressive multiplexing, but BROKEN for multi-statement transactions.
  Avoid unless you only do single-statement queries.
```

```
Transaction mode example:

App server (client connection to PgBouncer):
  BEGIN                     ← PgBouncer assigns real DB connection
  SELECT * FROM orders ...
  UPDATE orders SET ...
  COMMIT                    ← PgBouncer returns real DB connection to pool

  Between transactions: app holds client connection to PgBouncer,
  but NO real DB connection is consumed.
```

---

## Connection pool sizing formula

The right pool size isn't "as many as possible" — it's calculated from your DB server's concurrency capacity:

```
PostgreSQL optimal connections ≈ (core_count × 2) + effective_spindle_count

For a 4-core, SSD-backed DB:
  (4 × 2) + 1 = 9 → round to 10

This is the number of real DB connections PgBouncer (or your app pool) 
should maintain. More than this and you're just queuing at the DB.

HikariCP recommendation (backed by benchmarks):
  pool_size = (core_count × 2) + spindle_count
  For 4-core SSD: 9 connections
  For 4-core HDD (4 spindles): 12 connections
```

This seems shockingly small. The intuition: CPU-bound operations overlap I/O waits. Extra connections beyond the sweet spot just add context-switching overhead.

---

## Connection pool exhaustion

Pool exhaustion is when all connections are in use and new requests wait (or fail). It's a production incident cause:

```python
# Symptom: application logs fill with:
# "TimeoutError: QueuePool limit of size 10 overflow 5 reached"
# "HikariPool - Connection is not available, request timed out after 30000ms"

# Root causes:
# 1. Slow queries holding connections too long
# 2. Pool too small for traffic spike
# 3. Connection leak — code path that doesn't return connection to pool

# Connection leak example (common Python mistake):
def get_user(user_id: int):
    conn = engine.connect()           # ← borrows from pool
    result = conn.execute(...)
    # forgot conn.close() → connection never returned!
    return result

# Correct pattern — always use context manager:
def get_user(user_id: int):
    with engine.connect() as conn:    # ← auto-returns on exit
        return conn.execute(...)
```

```python
# Monitoring pool health:
from sqlalchemy import event
from sqlalchemy import pool

@event.listens_for(engine, "checkout")
def on_checkout(dbapi_conn, conn_record, conn_proxy):
    # Log when connections are borrowed
    pass

@event.listens_for(engine, "checkin") 
def on_checkin(dbapi_conn, conn_record):
    # Log when connections are returned
    pass

# Key metrics to track:
# pool.size          — configured pool size
# pool.checkedin     — connections currently in pool (idle)
# pool.checkedout    — connections currently in use
# pool.overflow      — connections beyond pool_size (overflow)
# pool.invalid       — connections that failed health check
```

---

## Architecture: where the pool lives

```
Small scale (< 10 app servers):
  App Server (application-level pool: 10 connections)
      │
  PostgreSQL

Medium scale (10–100 app servers):
  App Servers (app pool: 5 connections each)
      │
  PgBouncer (server-side pool: 20 real connections, 500 client connections)
      │
  PostgreSQL

Large scale (100+ app servers):
  App Servers (app pool: 5 connections each)
      │
  PgBouncer cluster (multiple PgBouncer instances, load-balanced)
      │
  PostgreSQL primary + read replicas
```

---

## Other databases

| Database | Pooler | Notes |
|---|---|---|
| PostgreSQL | PgBouncer, pgpool-II | PgBouncer recommended; pgpool adds HA/replication features |
| MySQL | ProxySQL, MySQL Router | ProxySQL adds read/write splitting, query caching |
| Redis | Built-in via clients | redis-py, Lettuce (Java) manage pools natively |
| MongoDB | Built-in driver pool | MongoClient maintains its own pool per process |

---

## Interview talking points

!!! tip "Key things to say"
    1. Every DB connection consumes ~5-10MB RAM and a backend process — the DB performs best with a small number of connections (roughly 2× CPU cores), not unlimited
    2. Application-level pools (HikariCP, SQLAlchemy) work per-process. With 100 app servers × 10 connections = 1,000 DB connections, you exceed most DB limits
    3. PgBouncer in transaction mode solves this: accepts 1,000 app connections but only maintains 20 real DB connections. The multiplexing happens at the transaction boundary
    4. Pool exhaustion is a production incident cause — almost always means either a slow query holding connections too long, or a connection leak. Fix the root cause, not just pool size
    5. The Hikari pool size formula: `(cores × 2) + spindles`. This feels too small but is backed by benchmarks — more connections = more context switching, not more throughput

## Related topics

- [Relational Databases](../storage/relational-databases.md) — why max_connections is a hard limit
- [Read Replicas](read-replicas.md) — ProxySQL can route reads to replicas automatically
- [Sharding](sharding.md) — at extreme scale, even pooled connections aren't enough
- [Caching](../storage/caching.md) — reducing DB load at the query level
