# Storage Engine Internals

Understanding how storage engines work internally explains why Cassandra writes are fast but reads are slower, why MySQL's InnoDB uses a B-tree, why RocksDB compacts in the background, and why a WAL is critical for crash recovery. These internals underpin hundreds of architectural decisions.

---

## Two storage engine families

Almost every database storage engine is built on one of two core data structures:

| | B-Tree | LSM Tree |
|---|---|---|
| **Optimized for** | Reads | Writes |
| **Write mechanism** | In-place update | Append-only |
| **Read performance** | Fast (few seeks) | Slower (multiple files) |
| **Write performance** | Slower (random I/O) | Very fast (sequential I/O) |
| **Space amplification** | Low | Higher (until compacted) |
| **Used by** | PostgreSQL, MySQL/InnoDB, SQLite | Cassandra, RocksDB, LevelDB, ScyllaDB |

---

## B-Tree Storage Engine

B-trees store data in fixed-size pages (typically 4KB or 8KB) on disk. Each page corresponds to a node in the tree.

```
Page 1 (root):  [25 | 50 | 75]
                 ↓     ↓     ↓     ↓
Page 2: [10|20] Page 3: [30|40] Page 4: [55|65] Page 5: [80|90]
```

**Write path (in-place update):**
```
1. Find the leaf page containing the key
2. Load that page into memory
3. Modify it in memory
4. Write the full page back to disk (even for a 1-byte change)

Worst case: update touches root → intermediate → leaf = multiple random writes
```

**Why reads are fast:** The tree is always sorted and balanced. Finding a row is `O(log n)` page reads = ~3-4 disk seeks for billions of rows.

**Why writes are slower:** Random I/O to update pages in place. On spinning disk, each random seek costs ~10ms. On SSD this is less severe (~0.1ms) — which is why B-trees work fine on modern hardware.

---

## Write-Ahead Log (WAL)

Both B-tree and LSM-tree engines use a WAL (also called a redo log or commit log) for crash recovery.

```
Write path with WAL:
  1. Append the change to the WAL (sequential write — fast)
  2. Update the in-memory data structure
  3. Acknowledge the write to the client
  4. (Later) Flush the in-memory state to disk in the background
```

**Why WAL exists:** Step 2 is fast but data is lost if the server crashes before step 4. The WAL is sequential and always flushed to disk before ack — on crash recovery, replay the WAL to reconstruct the in-memory state.

```
Crash → restart → replay WAL → restore exact pre-crash state → open for business
```

WAL enables **durable writes with sequential I/O** — the best of both worlds.

### WAL in PostgreSQL

```sql
-- Every committed transaction is written to the WAL before ack
-- pg_wal/ directory contains WAL segments

-- Streaming replication: replicas consume the WAL in real-time
-- Point-in-time recovery: replay WAL from a base backup to any point
```

---

## LSM Tree (Log-Structured Merge Tree)

LSM trees are designed for write-heavy workloads. Every write is sequential and append-only.

### Write path

```
1. Write goes to WAL (for durability)
2. Write goes to MemTable (in-memory sorted tree — e.g., a Red-Black tree)
3. Ack to client immediately

When MemTable fills (~64MB):
4. Flush to disk as an immutable SSTable file (Sorted String Table)
5. New MemTable is created
```

```
In memory:   [MemTable] ← new writes go here
On disk:     [SSTable L0-1][SSTable L0-2][SSTable L0-3]  ← recent flushes
             [SSTable L1-1][SSTable L1-2]                ← compacted
             [SSTable L2-1]                              ← more compacted
```

### What is an SSTable?

An SSTable is an immutable, sorted file on disk:

```
SSTable file:
  Index block:  [key → byte offset] (sparse, sampled keys)
  Data blocks:  [key1|value1][key2|value2]...[keyN|valueN]
  Bloom filter: "does key X probably exist in this file?"
  Metadata:     min key, max key, row count
```

Sorted + indexed: binary search within a single SSTable.  
Immutable: no in-place updates — old versions remain until compacted away.

### Read path (the trade-off)

```
Read key K:
1. Check MemTable (most recent writes, in memory)
2. Check L0 SSTables (newest first) — check Bloom filter first
3. Check L1 SSTables — check Bloom filter first
4. ...and so on down the levels

Worst case: key not found → checked all levels → expensive
```

This is why LSM trees are read-slower than B-trees: a read may touch multiple SSTables across multiple levels.

**Bloom filters save LSM reads:** Each SSTable has a Bloom filter. A negative answer ("key definitely not here") skips the file read entirely. See [Probabilistic Data Structures](probabilistic-data-structures.md).

### Compaction

SSTables accumulate. Compaction merges and rewrites them, removing duplicates and deleted keys (tombstones).

```
Before compaction (L0):
  SSTable 1: [alice=1, bob=2]
  SSTable 2: [alice=99, carol=3]   ← alice overwritten

After compaction (L1):
  SSTable merged: [alice=99, bob=2, carol=3]   ← only latest alice value

Tombstones:
  SSTable: [dave=<deleted>]        ← written when key deleted
  After compaction: dave is gone    ← tombstone and old value purged
```

**Compaction strategies:**

| Strategy | How | Trade-off |
|---|---|---|
| **Size-tiered** (Cassandra default) | Merge SSTables of similar size | Fast writes, more space amplification |
| **Leveled** (RocksDB default) | Each level has a fixed size limit; L1 → L2 → ... | Better read performance, more write I/O |
| **TWCS** (Cassandra time-window) | Compact within time windows | Optimal for time-series data |

---

## Memory-mapped files (mmap)

Some storage engines (LMDB, older MongoDB WiredTiger) use `mmap` to let the OS page cache handle buffer management.

```
mmap: OS maps a file into the process's virtual address space.
      Reads go to OS page cache if warm, disk if cold.
      The storage engine doesn't manage its own buffer pool.

Pros: Simple, OS handles eviction
Cons: Less control, can cause process to swap under memory pressure
```

Most high-performance engines (InnoDB, RocksDB) manage their own **buffer pool** for more predictable behavior.

---

## Buffer Pool / Page Cache

The buffer pool is the in-memory cache of disk pages. This is where most database performance lives.

```
InnoDB Buffer Pool (default: 128MB, should be ~70-80% of RAM):
  Page read: check buffer pool → hit = μs, miss = disk read = ms
  Page write: dirty pages accumulate in buffer → background flusher writes to disk
  LRU eviction: least recently used pages evicted when pool full
```

**Key insight:** A database that fits entirely in the buffer pool serves reads from RAM. This is why:
- Small hot datasets perform orders of magnitude better than large cold datasets
- Adding RAM often has more impact than adding faster disk
- The working set concept matters for capacity planning

---

## Copy-on-Write (MVCC)

Most modern databases use **Multi-Version Concurrency Control (MVCC)** to allow reads and writes to proceed concurrently without blocking each other.

```
Without MVCC: Read must wait for write to finish (or take a read lock)
With MVCC:    Old version served to readers; new version written in parallel
```

```
Transaction 1 (reader, started at T=100):
  Reads row "alice" → sees version at T=100 → balance: 500

Transaction 2 (writer, at T=101):
  Updates "alice" balance to 300 → writes new version at T=101
  Old version (T=100, balance=500) still exists for T1

T1 finishes → old version eligible for garbage collection (VACUUM in PostgreSQL)
```

**PostgreSQL:** Old row versions accumulate in the heap. `VACUUM` cleans them up.  
**MySQL InnoDB:** Old versions stored in the undo log.  
**Result:** `SELECT` never blocks `INSERT/UPDATE/DELETE` and vice versa.

---

## Storage engine comparison

| Database | Engine | Core structure | Optimized for |
|---|---|---|---|
| PostgreSQL | Heap + WAL | B-tree (indexes) | OLTP reads/writes |
| MySQL | InnoDB | Clustered B-tree | OLTP reads |
| SQLite | B-tree | B-tree | Embedded, ACID |
| Cassandra | Storage engine | LSM tree | Write-heavy, wide rows |
| RocksDB | RocksDB | LSM tree (leveled) | Embedded, write-heavy |
| LevelDB | LevelDB | LSM tree | Embedded KV |
| MongoDB WiredTiger | WiredTiger | B-tree + WAL | Document reads |
| HBase | HFile | LSM tree | Column-family reads |

---

## Interview angle

!!! tip "Storage internals in system design"
    - *"Why is Cassandra better for writes than PostgreSQL?"* → LSM tree: writes always append to MemTable (sequential, in-memory) then flush to SSTable. No in-place disk updates. B-tree requires random I/O to update pages.
    - *"Why does Cassandra have slower reads?"* → A read may need to check multiple SSTables across multiple levels. Bloom filters help skip files, but worst case it touches all levels.
    - *"What is a WAL and why does every database have one?"* → Sequential append before in-memory update. On crash: replay WAL to restore state. Sequential writes are 10-100× faster than random writes — WAL makes durable writes cheap.
    - *"What is compaction and why does it matter for operations?"* → Background process that merges SSTables, removes stale versions and tombstones. A compaction-lagging node has slower reads and higher disk usage — a key operational concern for Cassandra.

## Related topics

- [Database Indexes](database-indexes.md) — B-tree index internals
- [Probabilistic Data Structures](probabilistic-data-structures.md) — Bloom filters that make LSM reads fast
- [Storage: Wide-Column Stores](../storage/wide-column-stores.md) — Cassandra LSM in practice
- [Storage: Relational Databases](../storage/relational-databases.md) — B-tree engines in production
- [Consistency Models](consistency-models.md) — MVCC and isolation levels
- [Patterns: Replication](../patterns/replication.md) — WAL-based streaming replication
