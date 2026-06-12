# Storage

Choosing the right storage is one of the most consequential decisions in any system design. This section covers the full spectrum — from relational databases to blob storage.

## Suggested reading order

New to this topic? Read these in order — each builds on the previous:

1. [Relational Databases](relational-databases.md) — the baseline every other store is measured against
2. [SQL vs NoSQL](sql-vs-nosql.md) — the decision framework for everything that follows
3. [Key-Value Stores](key-value-stores.md) — the simplest NoSQL model, and why simplicity scales
4. [Document Stores](document-stores.md) — flexible schemas and the trade-offs they bring
5. [Wide-Column Stores](wide-column-stores.md) — write-heavy workloads at massive scale
6. [Blob Storage](blob-storage.md) — where unstructured data lives in almost every real system

**Then, as needed (reference):** [Search Engines](search-engines.md), [Time-Series Databases](time-series-databases.md), [Graph Databases](graph-databases.md), [Data Warehousing](data-warehousing.md)

**Advanced — come back later:** [NewSQL](newsql.md), [Vector Databases](vector-databases.md), [Modern Data Stack](modern-data-stack.md)

| Topic | One-liner |
|---|---|
| [SQL vs NoSQL](sql-vs-nosql.md) | The decision framework, not just the difference |
| [Relational Databases](relational-databases.md) | ACID, indexes, replication, PostgreSQL/MySQL patterns |
| [Key-Value Stores](key-value-stores.md) | Redis, DynamoDB — when simplicity wins |
| [Document Stores](document-stores.md) | MongoDB, DynamoDB — flexible schema tradeoffs |
| [Wide-Column Stores](wide-column-stores.md) | Cassandra, HBase — write-heavy, massive scale |
| [Time-Series Databases](time-series-databases.md) | InfluxDB, Timestream — metrics and events |
| [Search Engines](search-engines.md) | Elasticsearch — inverted indexes and full-text search |
| [Blob Storage](blob-storage.md) | S3 — unstructured data at any scale |
| [Caching](../caching/index.md) | Redis, Memcached — layers, eviction, invalidation |
| [Data Warehousing](data-warehousing.md) | OLAP, columnar storage, analytical workloads |
| [NewSQL](newsql.md) | CockroachDB, Spanner — ACID + horizontal scale |
| [Vector Databases](vector-databases.md) | Embeddings, semantic search, RAG — similarity at scale |
| [Graph Databases](graph-databases.md) | Neo4j, Neptune — traversing relationships at any depth |
