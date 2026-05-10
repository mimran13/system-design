# Compression

Compression trades CPU cycles for storage and bandwidth. The right compression algorithm depends on what you're compressing (text, binary, columns of similar values), how often you'll read it back, and where the bottleneck is. Compression matters everywhere: HTTP responses, databases, message queues, container images, file storage.

---

## Why compress

| Layer | Benefit |
|---|---|
| HTTP responses | Less network bytes → faster page loads, lower CDN bills |
| Database storage | Smaller pages → more rows in cache → faster queries |
| Columnar warehouses | Massive ratios on similar values → cheaper scans |
| Backups, archives | Storage cost reduction |
| Message queues | Network savings on large payloads |
| Container images | Faster pulls on every deploy |

Compression isn't always a win — it costs CPU and adds latency. Use it where bandwidth or storage dominates cost.

---

## The two big tradeoffs

```
Compression ratio  ←──→  Compression speed
Decompression speed ←──→ Memory usage
```

There's no single "best" algorithm. Different algorithms occupy different points on these curves.

---

## General-purpose algorithms compared

| Algorithm | Compression ratio | Compression speed | Decompression speed | Notes |
|---|---|---|---|---|
| **gzip (DEFLATE)** | Good | ~50 MB/s | ~150 MB/s | Universal, ubiquitous |
| **bzip2** | Better than gzip | ~10 MB/s | ~30 MB/s | Slow but compresses well |
| **xz (LZMA)** | Best ratio | ~5 MB/s | ~70 MB/s | Archival, package distribution |
| **lz4** | Modest | ~500 MB/s | ~3 GB/s | Compress fast |
| **zstd** | Better than gzip | ~400 MB/s | ~1.5 GB/s | Best balance; tunable |
| **snappy** | Modest | ~250 MB/s | ~500 MB/s | Google's "fast" choice |
| **brotli** | Better than gzip | ~50 MB/s | ~400 MB/s | Web-focused, dictionary-based |

The numbers are rough; real benchmarks depend heavily on input type and CPU.

---

## When to use which

### gzip

The HTTP / Linux default. Acceptable on every dimension; great on none. Fine when defaults are good enough or compatibility matters.

### zstd (Zstandard)

Modern default. Better ratio than gzip and faster on both compress and decompress. Adopted widely:

- Linux kernel & filesystems (btrfs, F2FS, ZFS)
- Modern HTTP (`Content-Encoding: zstd`)
- Apache Parquet
- RocksDB, MongoDB, Cassandra
- Conda, npm, Linux package formats

Tunable `level=1..22`; default 3 is a good speed/ratio balance.

### lz4

When you need speed above all. Used in:

- ZFS / BTRFS for transparent filesystem compression
- Real-time logs and traces
- Inter-process compression (rare but a fit)
- Rocket.io / RPC framing where serialization → compression → wire is in the hot path

### brotli

Optimised for web text content (HTML, JS, CSS) using a built-in dictionary of common web tokens. Used by:

- Cloudflare, Google, Akamai for HTTP
- Static asset bundles

Browsers support it via `Accept-Encoding: br`. Compresses ~20% better than gzip on web content.

### xz / LZMA

Highest ratio, slow. Use for archives, package distribution, anywhere "compress once, distribute many" pays off.

### snappy

Google's "fast and acceptable" choice. Used by BigQuery, Hadoop, Cassandra historically. Largely superseded by zstd in new systems.

---

## Specialised compression

### Run-Length Encoding (RLE)

Replace runs of repeated values with `(value, count)`:

```
input:  AAAAABBBCCCCAAAA
output: A5B3C4A4
```

Excellent for sparse data, simple to implement, near-zero CPU. Used in:

- Image formats (BMP)
- Columnar data with many repeated values
- Sparse matrices

### Dictionary-based (LZ77 family)

Compress by referencing earlier occurrences:

```
input:  the quick brown fox the quick brown
output: the quick brown fox <ref to position 0, length 16>
```

The basis of gzip, zstd, and most general-purpose compressors. Works great on text.

### Delta encoding

Store differences between consecutive values:

```
input:  100, 102, 101, 103, 104, 100
deltas: 100, +2, -1, +2, +1, -4
```

Excellent for time-series, sorted IDs, sensor data. Often combined with variable-length integer encoding (varint) for further savings.

### Bit-packing

For integers with limited range, store in fewer bits than the natural type size:

```
values:  3, 1, 2, 0, 3, 2, 1
needs:   2 bits each instead of 32 (16× savings)
```

Used in columnar formats (Parquet, ORC) when a column has known cardinality.

### Dictionary encoding (column store style)

Replace strings with small integer IDs that index into a dictionary:

```
column "country":  ["USA", "USA", "Germany", "USA", "Germany", "USA"]
dictionary:        {0: "USA", 1: "Germany"}
encoded:           [0, 0, 1, 0, 1, 0]
```

Enables further compression (RLE, bit-packing) on top. Standard in columnar warehouses.

---

## Columnar compression

Wide-column and OLAP databases (Parquet, ORC, ClickHouse, BigQuery, Redshift) store data **column by column**. Each column compresses independently — same data type, often similar values.

```
Row-by-row:
  ("alice", 30, "USA", "active"), ("bob", 25, "USA", "active"), ...
  Compresses poorly: heterogeneous types

Column-by-column:
  names:    "alice", "bob", "carol", ...     → dictionary
  ages:     30, 25, 28, ...                  → bit-packing or delta
  countries: "USA", "USA", "DE", "USA", ...  → dictionary + RLE
  status:   "active", "active", "active", ...→ RLE compresses to nothing
```

Compression ratios of 5-20× are normal for analytics data.

---

## When NOT to compress

- **Already-compressed data**: images (JPEG/PNG), video (H.264), audio (MP3), encrypted blobs (TLS, GPG output) — compression may even *grow* the file
- **Tiny payloads**: <100 bytes — overhead exceeds savings
- **CPU-bound applications**: where any extra cycle hurts, even at low compression levels
- **Random-access workloads**: compression typically requires decompressing larger units; consider block-level compression with random-access friendly formats

For small messages on hot paths, the right answer is often "don't compress at all" or "use lz4."

---

## HTTP compression

Standard headers:

```
Request:
  Accept-Encoding: gzip, br, zstd

Response:
  Content-Encoding: br
```

Server picks the best the client supports. Modern setup:

| Content type | Algorithm |
|---|---|
| Static text (HTML, JS, CSS) | brotli (highest ratio for web) |
| Dynamic responses | gzip or zstd (faster encode) |
| Already compressed (images, video) | none |

Most CDNs and reverse proxies handle this automatically. The win is significant — typical 60-80% size reduction on HTML.

---

## Database compression

| Database | Default compression |
|---|---|
| PostgreSQL | TOAST compresses long values (lz4 since 14, pglz before) |
| MySQL InnoDB | Optional page compression |
| RocksDB | Snappy default; often retuned to zstd or lz4 |
| Cassandra | LZ4 default; zstd recommended for cold data |
| ClickHouse | LZ4 default; ZSTD optional |
| Parquet (Spark, Trino) | Snappy default; ZSTD common |

For OLTP, decompression speed dominates (read-heavy). For OLAP and archival, compression ratio dominates.

---

## Container images

Docker / OCI images are compressed layers:

```
$ docker history myapp
LAYER          SIZE       COMPRESSED   ALGO
base           120 MB     45 MB        gzip
deps           50 MB      18 MB        gzip
src            5 MB       1.5 MB       gzip
```

Newer formats (zstd-compressed images, OCI 1.1) cut image size and pull time by ~30%. Worth enabling on registries that support it (ECR, GHCR).

---

## Compression and encryption

Compress *before* encrypt:

```
plaintext → compress → ciphertext
```

Encrypted data is high-entropy → compresses poorly. Always compress first.

But: **compression with secret data leaks** (CRIME, BREACH attacks against TLS). If the plaintext mixes attacker-controlled and secret data, compression ratio reveals secrets.

Mitigation in TLS 1.3: **TLS-level compression is forbidden**. App-level compression of mixed-secret data needs care; modern web frameworks pad responses or avoid compressing sensitive endpoints.

---

## Practical guidance

```
1. Default to zstd for new systems where you control both ends
   - Tunable levels, fast on both ends, great ratios

2. Default to gzip when compatibility matters
   - HTTP (alongside brotli), tar archives, traditional logs

3. Use lz4 when speed dominates
   - Inter-service binary protocols, real-time pipelines, filesystems

4. Use brotli for static web content
   - Pre-compress at build time; serve via CDN

5. Don't compress already-compressed data
   - Wastes CPU; can grow size

6. Don't compress tiny payloads
   - Overhead exceeds savings under ~100 bytes

7. For databases, follow the workload
   - OLTP: prefer fast decompress (lz4, zstd low level)
   - OLAP: prefer high ratio (zstd high level)
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you can match algorithm to use case, not just "I'd add gzip."

**Strong answer pattern:**
1. zstd is the modern default — better than gzip on most dimensions
2. lz4 when speed dominates; xz/LZMA when ratio dominates
3. Brotli for web static content (HTML/JS/CSS)
4. Columnar formats compress 5-20× via dictionary + RLE + bit-packing
5. Don't compress already-compressed or tiny data
6. Compress before encrypt; beware mixed-secret-data leaks

**Common follow-up:** *"How does Parquet achieve such high compression?"*
> Three layered techniques on each column independently. First, dictionary encoding maps repeated string values to small integers. Second, RLE collapses runs of identical values. Third, bit-packing reduces the integer width to the minimum needed. Then a general compressor (zstd or snappy) compresses the result. Each column has values of one type that often share patterns, so each layer compounds the savings.

---

## Related topics

- [Data Encoding & Serialization](serialization.md) — compression usually layered on top
- [Storage Engine Internals](storage-internals.md) — block-level compression in databases
- [Wide-Column Stores](../storage/wide-column-stores.md) — Parquet/ORC details
- [HTTP Versions](../networking/http-versions.md) — Content-Encoding negotiation
- [CDN](../networking/cdn.md) — pre-compressed asset delivery
