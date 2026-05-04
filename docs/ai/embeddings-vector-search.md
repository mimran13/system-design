# Embeddings & Vector Search

Embeddings convert text (or images, audio, code) into dense numerical vectors that encode semantic meaning. Vector search finds the most similar vectors to a query — the foundation of RAG, semantic search, and recommendation systems.

## What is an embedding?

An embedding model maps text to a point in a high-dimensional space such that semantically similar texts are geometrically close.

```
"dog"           → [0.23, -0.45, 0.67, ...]   (1536 dimensions)
"puppy"         → [0.25, -0.43, 0.65, ...]   ← very close
"cat"           → [0.20, -0.38, 0.59, ...]   ← nearby (animals)
"quantum physics" → [-0.12, 0.89, -0.34, ...]  ← far away
```

This is fundamentally different from keyword search, which matches exact strings. Vector search understands that "dog" and "canine" are related even if they share no characters.

---

## Embedding models

| Model | Dimensions | Context | Strength |
|---|---|---|---|
| `text-embedding-3-large` (OpenAI) | 3072 | 8191 tokens | Best general quality |
| `text-embedding-3-small` (OpenAI) | 1536 | 8191 tokens | Fast, cheap, good quality |
| `embed-v3-english` (Cohere) | 1024 | 512 tokens | Strong retrieval |
| `embed-v3-multilingual` (Cohere) | 1024 | 512 tokens | Multi-language |
| `all-MiniLM-L6-v2` (open source) | 384 | 256 tokens | Lightweight, fast, self-hostable |
| `bge-large-en-v1.5` (BAAI) | 1024 | 512 tokens | Strong open-source |
| `nomic-embed-text-v1.5` | 768 | 8192 tokens | Long context, open source |

**Choosing a model:**
- Prototype with `text-embedding-3-small` (OpenAI) — cheap and good
- For production RAG, benchmark on your own domain data before committing
- Long documents: prefer models with > 512 token context (e.g. `text-embedding-3-*`, `nomic-embed`)
- Self-hosting: `bge-large-en-v1.5` is the go-to open-source choice

---

## Similarity metrics

Given two embedding vectors A and B, measure their similarity:

### Cosine Similarity

The cosine of the angle between two vectors. Measures direction, not magnitude.

```
cosine_similarity(A, B) = (A · B) / (||A|| × ||B||)

Range: -1 (opposite) to 1 (identical)
0 = orthogonal (unrelated)
```

```python
import numpy as np

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
```

**Most common for text embeddings.** Normalised embeddings (unit vectors) make cosine similarity equivalent to dot product.

### Dot Product

```
dot_product(A, B) = sum(A[i] * B[i])
```

Faster than cosine (no normalisation). OpenAI embeddings are normalised by default, so dot product ≡ cosine similarity for them.

### Euclidean Distance (L2)

```
euclidean(A, B) = sqrt(sum((A[i] - B[i])^2))

Lower = more similar (0 = identical)
```

Used in some vector databases and image similarity. Less common for text.

---

## Approximate Nearest Neighbour (ANN)

Finding the exact nearest neighbour in a high-dimensional space requires comparing the query to every vector — O(n) per query. At scale (millions of vectors), this is too slow.

**ANN** trades a small accuracy loss (may miss the absolute best match) for dramatically faster search.

### HNSW (Hierarchical Navigable Small World)

The dominant ANN algorithm. Builds a layered graph where higher layers provide coarse navigation and lower layers provide fine-grained search.

```
Layer 2 (coarse):   A ──── C
                    |      |
Layer 1:            A──B──C──D
                    |  |  |  |
Layer 0 (fine):     A─B─E─C─F─D─G─H

Search:
1. Start at top layer, navigate to the nearest entry point
2. Drop down to next layer, refine
3. At layer 0, explore neighbours exhaustively in a small region
```

**Properties:**
- O(log n) search time
- ~10–50ms for millions of vectors
- Recall: configurable (ef_search parameter) — trade speed for accuracy
- Memory-intensive (stores graph structure + vectors)

```python
# Configure HNSW in pgvector
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Higher m = better recall, more memory
-- Higher ef_construction = better index quality, slower build
```

### IVF (Inverted File Index)

Clusters vectors into buckets (Voronoi cells) using k-means. At query time, only search the closest N clusters.

```
Training: cluster all vectors into K=1000 centroids
Query:
  1. Find the 10 closest centroids to query
  2. Search only vectors in those 10 clusters
  3. Return top results

nprobe = 10  → search 10 clusters (trade speed vs recall)
```

**Properties:**
- Lower memory than HNSW
- Slower for small datasets (k-means training required)
- Better for very large datasets (billions of vectors)
- Used in FAISS (Facebook AI Similarity Search)

### HNSW vs IVF

| | HNSW | IVF |
|---|---|---|
| Query speed | Very fast | Fast |
| Memory | High | Lower |
| Index build | Faster | Slower (needs training) |
| Recall at same speed | Higher | Lower |
| Best for | < 100M vectors | > 100M vectors |

---

## Vector databases

Dedicated databases for storing, indexing, and querying vectors at scale.

| Database | Type | Notes |
|---|---|---|
| **Pinecone** | Managed cloud | Easiest to start, no infra |
| **Weaviate** | OSS + cloud | Multi-modal, hybrid search built-in |
| **Qdrant** | OSS + cloud | Fast, Rust-based, rich filtering |
| **Chroma** | OSS | Great for local dev, simple API |
| **pgvector** | PostgreSQL extension | Best if you already use Postgres |
| **Redis Vector** | Redis extension | Good for low-latency use cases |
| **Milvus** | OSS | Scales to billions of vectors |
| **OpenSearch/ES kNN** | OSS | Good if already using Elastic |

**For most teams starting out: pgvector** — you already have Postgres, no new infra, supports HNSW and IVF, SQL + vector in one query.

```sql
-- pgvector setup
CREATE EXTENSION vector;

CREATE TABLE documents (
    id          BIGSERIAL PRIMARY KEY,
    content     TEXT,
    metadata    JSONB,
    embedding   VECTOR(1536)
);

-- HNSW index for fast approximate search
CREATE INDEX ON documents
USING hnsw (embedding vector_cosine_ops);

-- Similarity search
SELECT id, content, 1 - (embedding <=> $1) AS similarity
FROM documents
ORDER BY embedding <=> $1    -- <=> = cosine distance operator
LIMIT 10;
```

---

## Generating embeddings

```python
from openai import OpenAI

client = OpenAI()

def embed(text: str) -> list[float]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )
    return response.data[0].embedding

# Batch embedding (much more efficient)
def embed_batch(texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=texts  # up to 2048 inputs per request
    )
    return [d.embedding for d in response.data]
```

**Always batch** when embedding large corpora — one API call with 100 texts is ~10× cheaper and faster than 100 individual calls.

---

## Embedding dimensions & truncation

`text-embedding-3-*` models support **Matryoshka Representation Learning (MRL)** — you can truncate the embedding to fewer dimensions with minimal quality loss:

```python
# Full 1536 dimensions
embedding_full = embed("text")  # 1536 floats

# Truncate to 256 dimensions — ~6× less storage, ~2% quality drop
embedding_small = embed("text")[:256]
```

Or request shorter dimensions directly from the API:

```python
response = client.embeddings.create(
    model="text-embedding-3-small",
    input=text,
    dimensions=256   # request shorter embedding natively
)
```

This lets you trade storage and search cost against quality.

---

## Metadata filtering

Pure vector search returns the most semantically similar results — but you often need to filter by metadata too.

```python
# Hybrid: vector similarity + metadata filter
SELECT id, content, 1 - (embedding <=> $query_embedding) AS score
FROM documents
WHERE
    created_at > '2024-01-01'        -- metadata filter
    AND source = 'internal-wiki'     -- metadata filter
ORDER BY embedding <=> $query_embedding
LIMIT 10;
```

Most vector databases support **pre-filtering** (apply metadata filter before ANN search) or **post-filtering** (ANN search, then filter results). Pre-filtering can hurt recall if the filtered set is small.

---

## Embedding for code

Code embeddings require specialised models:

```python
# Voyage AI code embedding
model="voyage-code-2"

# OpenAI (general, works reasonably for code)
model="text-embedding-3-large"

# Open source
model="jinaai/jina-embeddings-v2-base-code"
```

For code search, embed at the function or class level — not line by line or whole-file.

---

## Re-ranking

ANN search is fast but imprecise. A **re-ranker** scores the top-K retrieved results more accurately and re-orders them.

```
Query → ANN search (top 50 results, fast)
      → Re-ranker (score top 50 more carefully, slow but only 50 items)
      → Return top 5 re-ranked results
```

```python
import cohere

co = cohere.Client()

def rerank(query: str, documents: list[str], top_n: int = 5) -> list:
    results = co.rerank(
        query=query,
        documents=documents,
        model="rerank-english-v3.0",
        top_n=top_n
    )
    return results.results
```

Re-rankers use cross-encoders (input is query+document together) which are much more accurate than bi-encoders (query and document encoded separately) but too slow for full-corpus search.

**Re-ranking improves RAG accuracy by 15–30%** on typical benchmarks with minimal latency impact.

---

## Interview / design angle

!!! tip "What comes up in AI system design"
    - *"How does your search handle synonyms or paraphrasing?"* → vector search (semantic), not keyword search
    - *"How do you scale to 100M documents?"* → HNSW or IVF index, sharded vector DB (Milvus/Pinecone)
    - *"Why not just use Elasticsearch?"* → ES does lexical (BM25), not semantic. Use hybrid: ES for keyword + vector DB for semantic
    - *"How do you keep embeddings fresh when documents update?"* → re-embed on change, use document ID for upserts

## Related topics

- [RAG](rag.md) — using embeddings in retrieval pipelines
- [Vector Databases](../storage/vector-databases.md) — storage layer deep dive
- [LLM Fundamentals](llm-fundamentals.md) — what embeddings are vs generative models
