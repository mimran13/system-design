# Search Engines

## What it is

A search engine database is optimized for full-text search, faceted filtering, and relevance ranking. It inverts the data — instead of "document → words," it builds "word → documents." This is the **inverted index**.

## The inverted index

```
Documents:
  doc1: "Redis is a fast in-memory database"
  doc2: "PostgreSQL is a relational database"
  doc3: "Redis and PostgreSQL work well together"

Inverted Index:
  "redis"      → [doc1, doc3]
  "fast"       → [doc1]
  "in-memory"  → [doc1]
  "database"   → [doc1, doc2]
  "postgresql" → [doc2, doc3]
  "relational" → [doc2]
  "together"   → [doc3]

Query: "redis database"
  → docs with "redis": [doc1, doc3]
  → docs with "database": [doc1, doc2]
  → intersection: doc1 (both terms)
  → union with ranking: doc1 (2 matches), doc3 (1 match), doc2 (1 match)
```

## Elasticsearch

The dominant search engine. Built on Apache Lucene. Used for product search, log analysis (ELK stack), application search.

### Core concepts

```
Cluster → Nodes → Indices → Shards → Documents

Cluster: 1+ nodes working together
Node: a single server (stores data + participates in search)
Index: logical namespace for documents (like a database)
Shard: a single Lucene index — the unit of distribution
Document: a JSON record
```

**Sharding:**
- An index is split into N primary shards distributed across nodes
- Each primary shard has M replicas (on different nodes)
- Read: query any replica; Write: primary shard only

```
Index: products (5 primary shards, 1 replica each)
Node 1: P0, P1, R2, R3
Node 2: P2, P3, R0, R4
Node 3: P4, R1

Search: fan-out to all 5 primary (or replica) shards → merge + rank results
```

### Indexing a document

```json
PUT /products/_doc/p_500
{
  "name": "Wireless Mechanical Keyboard",
  "description": "Compact 75% layout, Cherry MX switches, Bluetooth 5.0",
  "category": "electronics",
  "price": 129.99,
  "brand": "Keychron",
  "in_stock": true,
  "rating": 4.7,
  "tags": ["keyboard", "wireless", "mechanical"]
}
```

Elasticsearch analyzes text fields at index time:
```
"Wireless Mechanical Keyboard"
  → tokenize: ["Wireless", "Mechanical", "Keyboard"]
  → lowercase: ["wireless", "mechanical", "keyboard"]
  → stem: ["wireless", "mechan", "keyboard"]
  → store in inverted index
```

### Searching

```json
// Full-text search with relevance ranking
GET /products/_search
{
  "query": {
    "multi_match": {
      "query": "wireless keyboard",
      "fields": ["name^3", "description", "tags"],  // ^3 boosts name matches 3x
      "type": "best_fields"
    }
  }
}

// Filtered search (boolean query)
GET /products/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "name": "keyboard" } }
      ],
      "filter": [
        { "term": { "category": "electronics" } },
        { "range": { "price": { "gte": 50, "lte": 200 } } },
        { "term": { "in_stock": true } }
      ]
    }
  },
  "sort": [{ "rating": "desc" }],
  "from": 0,
  "size": 20
}
```

### Aggregations (faceted search)

```json
GET /products/_search
{
  "size": 0,
  "aggs": {
    "by_category": {
      "terms": { "field": "category" }
    },
    "price_ranges": {
      "range": {
        "field": "price",
        "ranges": [
          { "to": 50 },
          { "from": 50, "to": 100 },
          { "from": 100 }
        ]
      }
    },
    "avg_rating": {
      "avg": { "field": "rating" }
    }
  }
}
```

Response:
```json
{
  "aggregations": {
    "by_category": {
      "buckets": [
        { "key": "electronics", "doc_count": 1500 },
        { "key": "gaming", "doc_count": 320 }
      ]
    },
    "price_ranges": {
      "buckets": [
        { "key": "<50", "doc_count": 400 },
        { "key": "50-100", "doc_count": 800 },
        { "key": "100+", "doc_count": 620 }
      ]
    }
  }
}
```

### Relevance scoring (BM25)

Elasticsearch uses BM25 (Best Match 25) to score document relevance:

```
Score = IDF × TF-saturation

IDF (Inverse Document Frequency):
  Rare terms score higher than common terms
  "the" → low IDF  |  "elasticsearch" → high IDF

TF (Term Frequency) with saturation:
  More occurrences = higher score, but with diminishing returns
  Avoids inflating scores for documents that just repeat terms

Boost factors:
  Field boost (name^3): matches in title worth 3x body
  Document boost: promote sponsored/featured items
```

### Sync strategy: DB → Elasticsearch

Elasticsearch is rarely the source of truth. It's a secondary index over your primary DB.

**Option 1: Dual write**
```
App → write to DB
App → write to Elasticsearch
```
- Risk: one fails → inconsistency

**Option 2: CDC (Change Data Capture)**
```
DB (WAL/binlog) → Kafka → ES indexer → Elasticsearch
```
- Eventually consistent but reliable
- Debezium for Postgres/MySQL CDC

**Option 3: Batch sync job**
```
Scheduled job: read changed records from DB → re-index in ES
```
- Simple but has sync lag

### Near real-time (NRT)

Elasticsearch is near-real-time, not real-time. By default, new documents become searchable after a 1-second refresh interval (Lucene segment flush).

```
PUT /products/_settings
{ "refresh_interval": "5s" }  // Reduce for write-heavy indexing
```

## OpenSearch

AWS's fork of Elasticsearch (post-Elastic license change). Fully managed via Amazon OpenSearch Service. API-compatible with Elasticsearch 7.x.

## When to use search engines

| Good fit | Bad fit |
|---|---|
| Full-text search (product search, docs) | Primary data store (not durable enough) |
| Faceted filtering + aggregations | ACID transactions |
| Log analysis (ELK/OpenSearch) | Simple KV or relational queries |
| Autocomplete / prefix search | Single-record lookups by ID (use your primary DB) |
| Fuzzy matching / typo tolerance | Write-heavy without read optimization |

## AWS equivalent

| Service | Notes |
|---|---|
| Amazon OpenSearch Service | Managed Elasticsearch/OpenSearch |
| CloudSearch | Older AWS search service (prefer OpenSearch) |
| Kendra | ML-powered enterprise search |

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you treat Elasticsearch as a secondary index — not replace your DB with it — and understand the sync pattern.

**Strong answer pattern:**
1. Explain the inverted index intuitively
2. Identify what data goes in Elasticsearch — only what needs full-text/faceted search
3. Describe the sync mechanism — CDC from the primary DB
4. Mention it's near-real-time, not real-time
5. For autocomplete: use edge n-gram tokenizer or `search_as_you_type` field type

## Related topics

- [SQL vs NoSQL](sql-vs-nosql.md) — when to add a search layer
- [Messaging](../messaging/event-streaming.md) — CDC pipeline for sync
- [Caching](../caching/index.md) — cache popular search results
- [Search Autocomplete case study](../case-studies/search-autocomplete.md)
