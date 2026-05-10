# Disk and SSD Internals

Storage choices in databases, message queues, and filesystems are dictated by what disks actually do under the covers. Sequential vs random I/O, write amplification, and fsync cost explain why B-trees rule for OLTP, LSM-trees rule for write-heavy workloads, and append-only logs rule everywhere else.

---

## Spinning disks (HDD)

Mechanical: a magnetic platter spins, a head reads/writes by physically moving.

```
Sequential read:   100 MB/s  (head stays in track)
Random read:       100 IOPS  → ~1 MB/s @ 10 KB blocks
Random seek:       ~10 ms    (head movement + rotational latency)
```

Two costs dominate:

| Cost | Source |
|---|---|
| **Seek time** | Moving the read head (~5 ms) |
| **Rotational latency** | Waiting for sector under head (~5 ms at 7200 RPM) |

Sequential access avoids both because the head doesn't move. **A single seek = serving 1 MB of sequential data.**

This is why:
- Databases batch writes into sequential WAL appends
- LSM-trees flush sorted runs sequentially
- Message queues are append-only logs

HDDs persist for archival storage, backups, and large object stores (S3 backing tier). For active workloads, SSD wins.

---

## Solid State Drives (SSD)

No moving parts. NAND flash cells store bits. Order-of-magnitude faster, but with surprising constraints.

```
Sequential read:    3-7 GB/s    (NVMe)
Random read:        500 K-1M IOPS
Random write:       100-500 K IOPS
Latency:            ~100 µs random read
```

100× faster than HDD on random ops, but with quirks below.

### NAND quirks

**Pages, not bytes.** SSDs read/write in **pages** (typically 4-16 KB). Reading 1 byte loads a page; writing 1 byte requires read-modify-write.

**Erase before write.** A page can be written *only after* its enclosing **block** (containing 64-256 pages) is erased. Erase is slow (~2 ms) and wears the cells.

**Wear leveling.** Each cell tolerates ~3,000-100,000 erases before failure. The SSD controller spreads writes across cells to extend life.

**Write amplification.** To write a few bytes, the SSD may erase/rewrite a whole block. Effective write volume can be 2–10× logical write volume.

---

## Sequential vs random I/O

Even on NVMe SSDs, sequential is ~5× faster than random:

```
NVMe sequential read:  6 GB/s
NVMe random read:      1.5 GB/s @ 4KB blocks
```

Why? The drive's internal pre-fetcher, larger buffer alignment, and parallelism across NAND channels favour predictable patterns.

Implications:

- **Databases**: prefer sequential WAL, batch random page writes
- **Backups, snapshots**: stream sequentially
- **Logs, queues**: append-only is naturally sequential

---

## fsync — the write durability bottleneck

```c
write(fd, data, len);    // returns when data is in kernel page cache
                         // NOT yet on disk
fsync(fd);               // forces flush to physical media — actually durable
```

`fsync` is the boundary between "system thinks it's saved" and "survives a power outage." It's expensive:

```
SSD fsync:    ~100 µs - 1 ms
HDD fsync:    ~10 ms
```

A naive "fsync after every write" pattern caps you at 100-1000 writes/sec. Real systems batch writes between fsyncs:

```
PostgreSQL:  fsync the WAL once per commit (or group commit)
Kafka:       fsync per N messages or N milliseconds
SQLite:      fsync per transaction
```

This is the dominant cost in OLTP databases — and why there's so much engineering effort in batch commit, group commit, and async durability.

---

## The TRIM command

When a filesystem deletes a file, the SSD doesn't know — the blocks still hold data. TRIM tells the SSD "these blocks are free; you can erase them in background."

Without TRIM, the SSD slows down over time as it can't pre-erase blocks ahead of writes. Modern OSes issue TRIM automatically.

---

## Write amplification deep dive

```
Logical write:   4 KB  (your app writes 4KB)
Page size:       16 KB (must rewrite the whole page)
Block size:      256 pages = 4 MB (if block is full, must erase)

Worst case: rewrite 4 MB to land 4 KB → 1024× amplification
```

Mitigations:

- **Sequential workloads** — fill blocks before erasing
- **Over-provisioning** — extra capacity gives controller room to defragment
- **Garbage collection** — controller compacts partially-used blocks during idle time

LSM-tree databases (RocksDB, Cassandra) generate amplification at the application layer too:

```
SSTable level 0  → compacted into level 1 → ... → level 6
Each compaction rewrites data
Total write amplification: 10-30×
```

This is intentional: it makes writes sequential and predictable, at the cost of doing more total work.

---

## Page cache

Linux caches recently-read disk blocks in RAM (the **page cache**). Reads hit the cache instead of the disk.

```
free -h
              total        used        free      shared  buff/cache
Mem:          32G          12G         8G        500M    11G        ← 11G of cached disk pages
```

Implications:

- Database "cold cache" perf vs "warm cache" perf is huge — first query hits disk, subsequent queries hit RAM
- Reading a 100 GB dataset may saturate the cache; older entries get evicted
- `O_DIRECT` bypasses the page cache (databases do this to manage their own buffer pool)

---

## Block devices and filesystems

Layers between your `write()` call and the spinning rust / NAND cells:

```
write(fd, ...) 
  → filesystem (ext4, xfs, zfs)
    → block layer (LVM, dm-crypt)
      → device driver (NVMe, SATA)
        → physical media
```

Each layer adds capability and overhead. Databases sometimes bypass filesystems entirely for raw block performance (rare in modern setups; complexity rarely worth it).

---

## RAID and replication

Single disk is not durable enough for critical data. Two strategies:

| Strategy | Mechanism | Use |
|---|---|---|
| **RAID 0** | Striping across N disks | Speed only; one failure = total loss |
| **RAID 1** | Mirroring across 2 disks | Survives 1 failure |
| **RAID 5/6** | Parity across N disks | Survives 1-2 failures with less overhead |
| **RAID 10** | Mirror + stripe | Production default; survives most failures |
| **Replication** | Application-level copy across nodes | Survives node failure |

Modern cloud: ignore RAID at app level. Cloud disks (EBS, GCE PD) are already replicated; build replication at the database / application layer instead.

---

## Sizing — IOPS vs throughput vs capacity

When picking storage, three dimensions matter independently:

```
Capacity:     How much fits        TB
IOPS:         How many ops/sec     500K random reads
Throughput:   Bytes/sec            6 GB/s sequential
```

Workloads stress different dimensions:

| Workload | Bound by |
|---|---|
| OLTP database | IOPS (random reads/writes) |
| Analytics scan | Throughput (sequential read) |
| Log archive | Capacity |
| Cache layer | Throughput + IOPS (small random reads) |

AWS EBS volume types match these patterns: `gp3` (balanced), `io2` (high IOPS), `st1` (throughput-optimised), `sc1` (cold storage).

---

## How databases use disk

| Database | Disk pattern |
|---|---|
| **PostgreSQL / MySQL (InnoDB)** | B-tree pages (~16 KB), random writes, WAL for durability |
| **Cassandra / RocksDB / LevelDB** | LSM-tree, append-only sequential writes, periodic compaction |
| **Kafka** | Append-only log per partition, sequential writes, page cache for reads |
| **SQLite** | B-tree, fsync per commit |
| **Redis** | RAM primary, AOF (append) or RDB (snapshot) for durability |

The pattern reflects the workload:

- **OLTP, point lookups** → B-tree (fast reads, random writes acceptable)
- **Write-heavy, time-series** → LSM-tree (fast writes, compaction overhead)
- **Streaming, queues** → Append-only log (cheapest write pattern)

See [Storage Engine Internals](storage-internals.md) for the deep dive on B-tree vs LSM trade-offs.

---

## Cloud disks

Same principles, different abstractions:

| Provider | Block storage | Object storage |
|---|---|---|
| AWS | EBS (gp3, io2, st1) | S3 |
| GCP | Persistent Disk | Cloud Storage |
| Azure | Managed Disks | Blob Storage |

Cloud block storage is **network-attached** — there's an extra hop compared to local NVMe:

```
Local NVMe:   100 µs random read
Cloud EBS:    1-5 ms random read   (network adds 1-4 ms)
```

Cloud "instance store" / "local SSD" is direct-attached, faster but ephemeral.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you connect storage choices to physics, not just "use Postgres" reflexively.

**Strong answer pattern:**
1. Sequential vs random gap is huge — ~100× on HDD, ~5× on NVMe
2. fsync is the durability bottleneck; batch writes between fsyncs
3. Write amplification: SSD page/block boundaries + LSM compaction
4. Page cache makes warm reads ~RAM-fast; cold reads hit disk
5. Match storage type to workload bound (IOPS / throughput / capacity)

**Common follow-up:** *"Why does Kafka achieve such high throughput on commodity disks?"*
> Two reasons. First, Kafka writes are pure append — sequential I/O on disk, no random seeks. Second, reads usually come from the page cache because consumers are caught up with producers (recent data is hot). Kafka rarely hits actual disk on reads. The combination makes commodity disk look like RAM for the steady state.

---

## Related topics

- [Memory Hierarchy](memory-hierarchy.md) — disk is the layer below DRAM
- [Storage Engine Internals](storage-internals.md) — B-trees, LSM, WAL
- [Database Indexes](database-indexes.md) — how index choice interacts with disk pattern
- [Numbers Every Engineer Should Know](numbers-to-know.md) — disk numbers in context
- [Storage section](../storage/index.md) — database choices that follow from these properties
