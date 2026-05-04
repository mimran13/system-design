# Vector Databases

## What it is

A vector database stores high-dimensional numerical vectors (embeddings) and supports **similarity search** — finding vectors that are closest to a query vector. Traditional databases find exact matches; vector databases find approximate nearest neighbors.

```
Traditional DB query:
  "Find users WHERE city = 'London'"
  → Exact match on structured field

Vector DB query:
  "Find products similar to this product"
  → Convert product to a 768-dimensional vector
  → Find the 10 vectors closest to it in that 768-dimensional space
  
This is semantic search — finding things that are conceptually similar,
not just keyword-matching.
```

---

## Why embeddings exist

Machine learning models transform raw data (text, images, audio) into dense numerical vectors called **embeddings**. Similar items cluster near each other in this vector space.

```
Text embeddings (e.g., from OpenAI text-embedding-3-small):
  "The cat sat on the mat"   → [0.23, -0.14, 0.87, ..., 0.31]  (1536 dimensions)
  "A feline rested on a rug" → [0.24, -0.13, 0.88, ..., 0.30]  (very close!)
  "Quantum entanglement"     → [-0.91, 0.45, -0.23, ..., 0.67] (far away)

Cosine similarity between the first two: ~0.97  (nearly identical meaning)
Cosine similarity with the third: ~0.12  (unrelated)
```

**What generates embeddings:**
- Text: OpenAI Embeddings API, Sentence-BERT, Cohere Embed
- Images: CLIP, ResNet, ViT
- Audio: Whisper, audio2vec
- Code: CodeBERT, GitHub Copilot's internal models

---

## Similarity metrics

```
Cosine similarity (most common for text):
  Measures angle between vectors. Ignores magnitude.
  Range: -1 (opposite) to 1 (identical)
  
  cos(A, B) = (A · B) / (||A|| × ||B||)
  
  Use when: text similarity, recommendation systems

Euclidean distance (L2):
  Measures straight-line distance between vectors.
  Range: 0 (identical) to ∞
  
  d(A, B) = sqrt(Σ(aᵢ - bᵢ)²)
  
  Use when: image similarity, where magnitude matters

Dot product:
  Similar to cosine but magnitude-dependent.
  Useful when vectors are normalized (then = cosine similarity).
```

---

## The ANN problem

Exact nearest neighbor search in high-dimensional space requires comparing the query vector to every stored vector — O(N × D) where D is dimensions.

```
Naive exact search:
  1M vectors × 1536 dimensions × float32 (4 bytes) = 6GB per search scan
  At 100 queries/sec: 600GB/sec memory bandwidth needed
  → Impossible for real-time search
```

**Approximate Nearest Neighbor (ANN)** algorithms trade a small accuracy loss for massive speed gains:

```
Exact search:  finds the true nearest neighbors (100% recall)
ANN:           finds neighbors that are "close enough" (95-99% recall)
               but 100-1000× faster
```

---

## HNSW: the dominant ANN algorithm

**Hierarchical Navigable Small World** graphs are what most vector databases use internally.

```
Structure: a multi-layer graph

Layer 2 (sparse, long-range): o──────────────────o
                                    \           /
Layer 1 (medium):                  o───o────o──o
                                  /         \
Layer 0 (dense, all nodes):  o─o─o─o─o─o─o─o─o─o─o

Search algorithm:
  1. Enter at top layer (sparse)
  2. Greedily navigate to nearest neighbor at this layer
  3. Drop down to next layer and repeat
  4. At layer 0 (dense), explore neighborhood thoroughly
  
  Result: O(log N) search — extremely fast even for millions of vectors

Build time: O(N log N)
Search time: O(log N)
Memory: O(N × M) where M is the number of connections per node (typically 16-64)
```

---

## Major vector databases

```
Pinecone:
  Fully managed, serverless
  No infrastructure to manage
  Scales automatically
  Best for: teams that want zero operational overhead
  
Weaviate:
  Open-source, self-hosted or cloud
  Built-in modules for automatic vectorization (you send text, it embeds it)
  Supports hybrid search (vector + keyword BM25)
  Best for: teams that want control + hybrid search
  
Qdrant:
  Open-source, written in Rust (very fast)
  Rich filtering during vector search
  Best for: high-performance on-premise deployments

Chroma:
  Open-source, developer-friendly
  Great for prototyping and local development
  Best for: getting started fast, small to medium scale

pgvector (PostgreSQL extension):
  Adds vector search to existing PostgreSQL
  Familiar SQL interface, transactions, joins
  Lower performance than purpose-built vector DBs at large scale
  Best for: existing PostgreSQL shops, moderate scale, keeping data in one place
  
Redis (RediSearch + vector field):
  Vector search on top of Redis
  Best for: teams already on Redis who need low-latency semantic search
```

---

## Code examples

### Storing and querying with pgvector

```python
# pip install psycopg2-binary pgvector openai

import openai
import psycopg2
from pgvector.psycopg2 import register_vector

client = openai.OpenAI()
conn = psycopg2.connect("postgresql://localhost/mydb")
register_vector(conn)

# Schema
with conn.cursor() as cur:
    cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id          SERIAL PRIMARY KEY,
            content     TEXT NOT NULL,
            embedding   vector(1536),      -- OpenAI text-embedding-3-small
            metadata    JSONB
        )
    """)
    # HNSW index for fast approximate search
    cur.execute("""
        CREATE INDEX IF NOT EXISTS documents_embedding_idx
        ON documents USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)
    conn.commit()

def embed(text: str) -> list[float]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding

def index_document(content: str, metadata: dict = None):
    """Embed and store a document."""
    embedding = embed(content)
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO documents (content, embedding, metadata) VALUES (%s, %s, %s)",
            (content, embedding, metadata or {}),
        )
        conn.commit()

def semantic_search(query: str, top_k: int = 5) -> list[dict]:
    """Find documents semantically similar to the query."""
    query_embedding = embed(query)
    
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, content, metadata,
                   1 - (embedding <=> %s::vector) AS similarity
            FROM documents
            ORDER BY embedding <=> %s::vector   -- cosine distance
            LIMIT %s
        """, (query_embedding, query_embedding, top_k))
        
        rows = cur.fetchall()
        return [
            {'id': r[0], 'content': r[1], 'metadata': r[2], 'similarity': r[3]}
            for r in rows
        ]

# Usage
index_document("The new iPhone features a titanium frame and USB-C")
index_document("Apple's latest laptop has M3 Pro chip with 18-hour battery")
index_document("PostgreSQL 16 adds more parallelism options")

results = semantic_search("Apple hardware announcements")
# Returns iPhone and MacBook docs, not the PostgreSQL doc
```

### Pinecone (managed, production-grade)

```python
# pip install pinecone openai

from pinecone import Pinecone, ServerlessSpec
import openai

pc = Pinecone(api_key="YOUR_API_KEY")
oai = openai.OpenAI()

# Create index
pc.create_index(
    name="documents",
    dimension=1536,          # must match your embedding model
    metric="cosine",
    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
)

index = pc.Index("documents")

def upsert_documents(docs: list[dict]):
    """Embed and store multiple documents."""
    texts = [d['content'] for d in docs]
    response = oai.embeddings.create(
        model="text-embedding-3-small",
        input=texts,
    )
    
    vectors = [
        {
            'id': doc['id'],
            'values': emb.embedding,
            'metadata': {'content': doc['content'], **doc.get('metadata', {})}
        }
        for doc, emb in zip(docs, response.data)
    ]
    
    index.upsert(vectors=vectors)

def search(query: str, top_k: int = 5, filter: dict = None) -> list[dict]:
    """Semantic search with optional metadata filter."""
    query_emb = oai.embeddings.create(
        model="text-embedding-3-small",
        input=query,
    ).data[0].embedding
    
    results = index.query(
        vector=query_emb,
        top_k=top_k,
        include_metadata=True,
        filter=filter,          # e.g., {"category": {"$eq": "tech"}}
    )
    
    return [
        {'id': m.id, 'score': m.score, **m.metadata}
        for m in results.matches
    ]

# Filtered search: semantic similarity + metadata filter
results = search(
    query="Apple hardware",
    filter={"published_year": {"$gte": 2024}},
)
```

---

## RAG: the most common vector DB use case

**Retrieval-Augmented Generation** — using a vector DB to give an LLM relevant context:

```
Without RAG:
  User: "What did our Q3 earnings report say about margins?"
  LLM: "I don't have access to your internal documents."

With RAG:
  1. At index time: chunk Q3 earnings PDF → embed → store in vector DB
  
  2. At query time:
     a. Embed user's question
     b. Vector search → retrieve top 5 most relevant document chunks
     c. Add those chunks to the LLM prompt as context
     d. LLM answers from the retrieved context
  
  Result: LLM answers with knowledge from your internal documents
```

```python
def rag_query(user_question: str) -> str:
    """Answer a question using documents in vector DB as context."""
    
    # Step 1: Retrieve relevant chunks
    relevant_chunks = semantic_search(user_question, top_k=5)
    
    # Step 2: Build context from retrieved chunks
    context = "\n\n".join([
        f"Source: {chunk['metadata'].get('source', 'unknown')}\n{chunk['content']}"
        for chunk in relevant_chunks
    ])
    
    # Step 3: Ask LLM with context
    response = client.chat.completions.create(
        model="claude-3-5-sonnet-20241022",
        messages=[
            {
                "role": "system",
                "content": "Answer questions using only the provided context. "
                           "If the answer isn't in the context, say so."
            },
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {user_question}"
            }
        ]
    )
    
    return response.choices[0].message.content
```

---

## Hybrid search

Pure vector search can miss exact keyword matches that have low semantic similarity. Hybrid search combines both:

```
Query: "PostgreSQL VACUUM command"

Vector search result: documents about database maintenance, autovacuum
  → Good for related concepts, misses exact "VACUUM" docs

Keyword search (BM25) result: documents containing "VACUUM"
  → Finds exact mentions but misses synonyms

Hybrid search (RRF — Reciprocal Rank Fusion):
  Combine rankings from both systems
  Score = 1/(k + rank_vector) + 1/(k + rank_keyword)
  → Best of both: semantic + exact match
  
  Weaviate, Qdrant, Elasticsearch all support hybrid search natively.
```

---

## Scaling vector databases

```
Single node:
  Qdrant, pgvector handle up to ~10M vectors comfortably
  Beyond that: memory becomes the bottleneck

Sharding:
  Pinecone, Weaviate distribute vectors across nodes automatically
  Query fan-out: query all shards, merge top-K results

Filtering challenge:
  "Find 10 nearest neighbors WHERE category = 'electronics'"
  
  Problem: pre-filtering reduces the search space, ANN becomes less accurate
  (you may not have 10 electronics items near the query vector)
  
  Solution: post-filtering (find top-1000 by vector, then filter)
  or ACORN index (Pinecone's approach: filter-aware ANN)
```

---

## When to use a vector database

```
Use vector DB when:
  ✓ Semantic search ("find similar products/articles/code")
  ✓ Recommendation systems based on content similarity
  ✓ RAG (LLM + internal knowledge base)
  ✓ Anomaly detection (find vectors far from all clusters)
  ✓ Duplicate detection (find near-duplicate content)
  ✓ Image similarity search

Don't use vector DB when:
  ✗ You need exact matches (use a regular DB + index)
  ✗ Structured queries with filters dominate (vector search is secondary)
  ✗ You don't have embedding infrastructure (high ML complexity cost)
```

---

## Interview talking points

!!! tip "Key things to say"
    1. Vector DBs store embeddings (ML model outputs) and find similar vectors via ANN algorithms — not exact matches. The similarity is semantic, not syntactic
    2. HNSW is the dominant index structure: hierarchical graph search in O(log N), trades ~5% recall for 100-1000× speedup over exact search
    3. RAG is the most common use case: embed your documents into a vector DB, then at query time retrieve the most relevant chunks to give an LLM as context
    4. pgvector adds vector search to existing PostgreSQL — good for existing shops at moderate scale. Purpose-built DBs (Pinecone, Qdrant) outperform at large scale
    5. Hybrid search (vector + keyword BM25) often outperforms pure vector search — semantic similarity misses exact keyword matches; combining both covers more cases

## Related topics

- [Search Engines](search-engines.md) — Elasticsearch supports vector search (kNN) alongside traditional full-text
- [Blob Storage](blob-storage.md) — store raw documents/images in S3; store their embeddings in vector DB
- [Caching](caching.md) — cache embedding computations (expensive) and frequent query results
