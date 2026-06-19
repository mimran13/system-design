# Storage

<div class="sec-hero" markdown>
<span class="ey">Data · picking a datastore</span>
Choosing the right storage is one of the most consequential decisions in any system design. This section covers the full spectrum — from relational databases to blob storage.
</div>

## Roadmap

<div class="roadmap">
  <div class="rm-head">
    <span class="h">🧭 Storage roadmap</span>
    <span class="legend">
      <i><span class="sw core"></span>core path</i>
      <i><span class="sw opt"></span>read as needed</i>
      <i><span class="sw adv"></span>advanced / later</i>
    </span>
  </div>
  <p class="rm-sub">Follow the spine top-to-bottom your first time. Branches hang off the topic they support — grab them when you need them.</p>
  <div class="rm-track">
    <div class="rm-stop">
      <a class="rm-node" href="relational-databases/"><span class="n">1</span>Relational Databases</a>
      <div class="rm-branch right"><a class="rm-chip" href="newsql/">NewSQL</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="search-engines/">Search Engines</a><a class="rm-chip" href="time-series-databases/">Time-Series Databases</a><a class="rm-chip" href="graph-databases/">Graph Databases</a></div>
      <a class="rm-node" href="sql-vs-nosql/"><span class="n">2</span>SQL vs NoSQL</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="key-value-stores/"><span class="n">3</span>Key-Value Stores</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="document-stores/"><span class="n">4</span>Document Stores</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="wide-column-stores/"><span class="n">5</span>Wide-Column Stores</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="blob-storage/"><span class="n">6</span>Blob Storage</a>
      <div class="rm-branch right"><a class="rm-chip" href="vector-databases/">Vector Databases</a></div>
    </div>
  </div>
</div>

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

## The decision & the baseline

Start here — the framework for choosing, and the relational store everything else is measured against.

<div class="pcards">
<a class="pcard" href="sql-vs-nosql/"><span class="t">SQL vs NoSQL</span><span class="d">The decision framework, not just the difference</span></a>
<a class="pcard" href="relational-databases/"><span class="t">Relational Databases</span><span class="d">ACID, indexes, replication, PostgreSQL/MySQL patterns</span></a>
</div>

## NoSQL models

The core NoSQL families — pick by access pattern, write volume, and schema flexibility.

<div class="pcards">
<a class="pcard" href="key-value-stores/"><span class="t">Key-Value Stores</span><span class="d">Redis, DynamoDB — when simplicity wins</span></a>
<a class="pcard" href="document-stores/"><span class="t">Document Stores</span><span class="d">MongoDB, DynamoDB — flexible schema tradeoffs</span></a>
<a class="pcard" href="wide-column-stores/"><span class="t">Wide-Column Stores</span><span class="d">Cassandra, HBase — write-heavy, massive scale</span></a>
</div>

## Specialized stores

Purpose-built engines for search, time-series, blobs, graphs, and analytics.

<div class="pcards">
<a class="pcard" href="time-series-databases/"><span class="t">Time-Series Databases</span><span class="d">InfluxDB, Timestream — metrics and events</span></a>
<a class="pcard" href="search-engines/"><span class="t">Search Engines</span><span class="d">Elasticsearch — inverted indexes and full-text search</span></a>
<a class="pcard" href="blob-storage/"><span class="t">Blob Storage</span><span class="d">S3 — unstructured data at any scale</span></a>
<a class="pcard" href="graph-databases/"><span class="t">Graph Databases</span><span class="d">Neo4j, Neptune — traversing relationships at any depth</span></a>
<a class="pcard" href="data-warehousing/"><span class="t">Data Warehousing</span><span class="d">OLAP, columnar storage, analytical workloads</span></a>
</div>

## Modern & emerging

Newer entrants — distributed SQL, embeddings, and the analytics stack.

<div class="pcards">
<a class="pcard" href="newsql/"><span class="t">NewSQL</span><span class="d">CockroachDB, Spanner — ACID + horizontal scale</span></a>
<a class="pcard" href="vector-databases/"><span class="t">Vector Databases</span><span class="d">Embeddings, semantic search, RAG — similarity at scale</span></a>
<a class="pcard" href="modern-data-stack/"><span class="t">Modern Data Stack</span><span class="d">Ingestion, transformation, and the analytics pipeline</span></a>
<a class="pcard" href="../caching/"><span class="t">Caching</span><span class="d">Redis, Memcached — layers, eviction, invalidation</span></a>
</div>
