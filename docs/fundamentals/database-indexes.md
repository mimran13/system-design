# Database Indexes

An index is a data structure that lets the database find rows without scanning every row in a table. It's the single highest-leverage performance tool in relational databases. Understanding indexes — and when not to use them — is essential for any backend engineer.

---

## You'll see this when...

- Query that "should be fast" takes 5 seconds — almost always missing index
- `EXPLAIN ANALYZE` shows "Seq Scan" on a large table (full table scan)
- Postgres slow query log keeps showing the same query
- Adding `WHERE email = ?` clause silently goes from O(log n) to O(n)
- Database CPU pegged but data volume is small — index issues
- ORM-generated query that's hard to optimise (N+1, no covering index)
- "Why is this select-by-id slow?" — primary key index missing or bloated
- Index rebuild needed (REINDEX, VACUUM FULL) on Postgres
- Choosing between B-tree, hash, GIN, GiST, BRIN index types

---

## Why indexes matter

```sql
-- Without index on email: full table scan
SELECT * FROM users WHERE email = 'alice@example.com';
-- 10M rows → reads all 10M rows → 5-10 seconds

-- With index on email: index lookup
SELECT * FROM users WHERE email = 'alice@example.com';
-- 10M rows → reads ~3 index nodes → 1-2 ms
```

Cost comparison:
- **Full table scan (no index):** O(n) — reads every row
- **B-tree index lookup:** O(log n) — ~23 reads for 10M rows

---

## B-Tree Index (the default)

The B-tree (balanced tree) is the default index type in PostgreSQL, MySQL, and most relational databases.

```
                    [50]
                   /    \
              [25]        [75]
             /    \      /    \
           [10]  [35] [60]  [90]
           / \   / \   / \   / \
         [8][15][30][40][55][65][85][95]
              ↑
         Leaf nodes store actual row pointers (or full row data in clustered index)
```

**Properties:**
- Tree stays balanced — height ≈ log₂(n) ≈ 23 for 10M rows
- Leaf nodes are linked (doubly-linked list) → efficient range scans
- Supports: equality (`=`), range (`>`, `<`, `BETWEEN`), prefix (`LIKE 'Alice%'`)
- Does NOT support: suffix/contains (`LIKE '%alice'`), full-text search

### Clustered vs Non-clustered

| | Clustered (InnoDB primary key) | Non-clustered (secondary index) |
|---|---|---|
| Stores | Full row data in leaf nodes | Row pointer (primary key) in leaf nodes |
| One per table | Yes — rows are physically ordered by this | Many allowed |
| Lookup cost | One tree traversal | Two traversals (index → PK → row) |
| Range scans | Very fast (data is sorted) | Slower (random I/O to data pages) |

In MySQL/InnoDB, the primary key is always the clustered index. Choose a monotonically increasing PK (auto-increment, UUID v7) to avoid page splits.

---

## Hash Index

```
Hash(email) → bucket → [row pointer]
```

- **Exactly one use case:** equality lookups (`WHERE email = ?`)
- O(1) lookup — faster than B-tree for exact matches
- Does NOT support range queries, ordering, or prefix matching
- Used implicitly in PostgreSQL for hash joins; explicit `CREATE INDEX USING HASH` rarely used

---

## Composite Index

An index on multiple columns. **Column order matters.**

```sql
-- Composite index on (user_id, created_at)
CREATE INDEX idx_posts_user_date ON posts(user_id, created_at);
```

This index can serve:
```sql
-- ✅ Uses index (leading column matches)
SELECT * FROM posts WHERE user_id = 42;
SELECT * FROM posts WHERE user_id = 42 AND created_at > '2024-01-01';
SELECT * FROM posts WHERE user_id = 42 ORDER BY created_at DESC;

-- ❌ Does NOT use index (leading column missing)
SELECT * FROM posts WHERE created_at > '2024-01-01';
```

**Left-prefix rule:** An index on `(A, B, C)` can serve queries on `A`, `A+B`, or `A+B+C` — but not `B`, `C`, or `B+C` alone.

**Selectivity rule:** Put the most selective column first.
```sql
-- Good: user_id is highly selective (few rows per user)
CREATE INDEX ON posts(user_id, status);

-- Bad: status has low selectivity (many rows per status)
CREATE INDEX ON posts(status, user_id);
```

---

## Covering Index

A **covering index** includes all columns needed by the query, so the database never touches the main table.

```sql
-- Query needs: user_id, email, name
SELECT user_id, email, name FROM users WHERE user_id = 42;

-- Non-covering: index has user_id, must fetch row for email and name
CREATE INDEX idx_users_id ON users(user_id);

-- Covering: all columns in index, no row lookup needed
CREATE INDEX idx_users_covering ON users(user_id) INCLUDE (email, name);
-- PostgreSQL syntax; MySQL: CREATE INDEX ... ON users(user_id, email, name)
```

Covering indexes eliminate the second lookup (index → row), which is especially valuable when the row data is not in cache (random I/O).

---

## Partial Index

An index on a subset of rows. Smaller and faster when you only query a specific condition.

```sql
-- Only index unprocessed orders (the hot working set)
CREATE INDEX idx_orders_pending ON orders(created_at)
WHERE status = 'pending';

-- 10M total orders, 50K pending → 50K-row index instead of 10M-row index
-- Much smaller, stays in memory, faster scans
```

---

## Full-Text Index

B-tree doesn't support `LIKE '%keyword%'`. Full-text indexes tokenize text and allow keyword search.

```sql
-- PostgreSQL full-text index
CREATE INDEX idx_articles_fts ON articles USING gin(to_tsvector('english', body));

SELECT * FROM articles
WHERE to_tsvector('english', body) @@ to_tsquery('english', 'distributed & systems');
```

For serious full-text search, use Elasticsearch or OpenSearch — see [Search Engines](../storage/search-engines.md).

---

## Index maintenance cost

Indexes are not free. Every write (INSERT, UPDATE, DELETE) must update all indexes on the table.

```
Table with 5 indexes:
  INSERT 1 row → writes to heap + 5 index trees = 6 write operations
  UPDATE 1 row → potentially 6 reads + 6 writes (if indexed columns change)
```

**Rules of thumb:**
- High-read, low-write tables: index aggressively
- High-write tables (logs, metrics, events): index conservatively — every index slows writes
- Never add an index without profiling the query — indexes cost write throughput and storage

---

## Index selectivity

**Selectivity** = number of distinct values / total rows. High selectivity = better index.

```
users.email:    10M distinct / 10M rows = 1.0  (perfect — use an index)
posts.user_id:  1M distinct / 50M rows  = 0.02 (ok — depends on query)
orders.status:  5 distinct / 10M rows   = 0.0000005 (terrible — index rarely helps)
```

A low-selectivity column like `status = 'active'` might return 60% of rows — at that point, a full table scan is actually faster than the index lookup + random I/O.

---

## Index patterns to avoid

```sql
-- ❌ Function on indexed column — index can't be used
WHERE LOWER(email) = 'alice@example.com'
-- Fix: store email already lowercased, or use a functional index:
CREATE INDEX ON users (LOWER(email));

-- ❌ Leading wildcard — B-tree can't use prefix
WHERE name LIKE '%alice%'
-- Fix: full-text index, or use Elasticsearch

-- ❌ Implicit type conversion — index can't be used
WHERE user_id = '123'  -- user_id is integer, '123' is string
-- Fix: match types exactly

-- ❌ OR on different columns — hard to use indexes
WHERE user_id = 1 OR email = 'alice@example.com'
-- Fix: UNION of two indexed queries
```

---

## EXPLAIN / query plans

Always verify your index is being used:

```sql
-- PostgreSQL
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'alice@example.com';

-- Output shows:
Index Scan using idx_users_email on users (cost=0.43..8.45 rows=1)
  Index Cond: (email = 'alice@example.com')
Planning Time: 0.1 ms
Execution Time: 0.3 ms

-- vs without index:
Seq Scan on users (cost=0.00..234.00 rows=1)  ← full scan
  Filter: (email = 'alice@example.com')
```

---

## Index strategy for common patterns

| Pattern | Index strategy |
|---|---|
| PK lookup | Primary key (clustered) — automatic |
| Unique constraint (email, username) | Unique index |
| Foreign key joins | Index the FK column |
| Range queries (`created_at BETWEEN`) | B-tree on date column |
| Multi-tenant queries (`WHERE tenant_id = ?`) | Leading column in composite index |
| Sort + filter (`ORDER BY created_at WHERE user_id = ?`) | Composite `(user_id, created_at)` |
| Full-text search | GIN index or Elasticsearch |
| Geospatial (`nearby users`) | GiST index (PostGIS) |

---

## Interview angle

!!! tip "Index questions in system design"
    - *"How would you speed up this slow query?"* → EXPLAIN the query plan, identify seq scans, add selective index on the WHERE/JOIN column. Check if a covering index eliminates the row fetch.
    - *"Why can't you just index every column?"* → Every index adds write overhead and storage. On a high-write table, too many indexes can make writes slower than the reads they accelerate.
    - *"How does Instagram query a user's recent posts efficiently?"* → Composite index on `(user_id, created_at DESC)` — serves `WHERE user_id = ? ORDER BY created_at DESC LIMIT 20` in a single index scan.

## Related topics

- [Storage: Relational Databases](../storage/relational-databases.md) — full DB internals
- [Back-of-Envelope Estimation](estimation.md) — sizing index memory requirements
- [Caching](../caching/caching-strategies.md) — when to cache vs index
- [Storage: Search Engines](../storage/search-engines.md) — full-text and specialized indexing
