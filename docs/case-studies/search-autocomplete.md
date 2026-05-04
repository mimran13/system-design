# Design Search Autocomplete (Typeahead)

## Problem statement

Design a search autocomplete system (like Google's search bar) that:
- Returns top 5 suggestions as user types each character
- 10 million DAU, 10 queries/user/day = 100M queries/day
- Response in < 100ms (feels instant)
- Suggestions ranked by popularity/frequency
- Updates suggestions as trending topics change (within hours)

## Clarifying questions

```
1. What are we autocompleting? Web search or product/user search?
   → General search queries (like Google)

2. Personalized or global suggestions?
   → Global (same suggestions for everyone with same prefix)
   → Personalization is a stretch goal

3. How fresh? Real-time trending or hourly updates?
   → Hourly updates acceptable

4. Profanity / content filtering?
   → Yes, filter offensive suggestions

5. Multiple languages?
   → English only for now
```

## Scale estimation

```
100M queries/day = 1,200/sec average, 6,000/sec peak
Average query = 4 characters → 4 autocomplete requests per search
Total: 100M × 4 = 400M autocomplete requests/day = 5,000/sec

Trie memory: 1M unique queries × avg 10 chars × 2 bytes = ~20MB per node level
             Manageable in RAM

Response: 5 suggestions × 30 chars avg = 150 bytes → negligible bandwidth
```

## Data structure: Trie

A prefix tree. Every node is a character; paths spell out queries.

```
       root
      /    \
     a      b
    /        \
   ap         be
  / \           \
 app aps         best
  |
apple → [count: 50,000]

Search "app" → traverse a→p→p → return top suggestions below this node
```

```python
from collections import defaultdict
import heapq

class TrieNode:
    def __init__(self):
        self.children: dict[str, 'TrieNode'] = {}
        self.is_end = False
        self.frequency = 0
        self.top_suggestions: list[tuple[int, str]] = []  # cached top 5

class Trie:
    def __init__(self):
        self.root = TrieNode()
    
    def insert(self, word: str, frequency: int):
        node = self.root
        for char in word:
            if char not in node.children:
                node.children[char] = TrieNode()
            node = node.children[char]
        node.is_end = True
        node.frequency = frequency
    
    def search(self, prefix: str) -> list[str]:
        node = self.root
        for char in prefix:
            if char not in node.children:
                return []
            node = node.children[char]
        
        # Return cached top suggestions for this prefix
        if node.top_suggestions:
            return [word for _, word in node.top_suggestions]
        
        # DFS to find all words below this node (cold start)
        results = []
        self._dfs(node, prefix, results)
        return [word for _, word in heapq.nlargest(5, results)]
    
    def _dfs(self, node: TrieNode, current: str, results: list):
        if node.is_end:
            results.append((node.frequency, current))
        for char, child in node.children.items():
            self._dfs(child, current + char, results)
```

## Optimization: cache top-5 at each node

Without caching, search traverses all suffixes for every prefix — O(prefix_length × node_count). Cache top-5 suggestions at each node during build:

```python
def build_with_cache(trie: Trie):
    """Post-order DFS: compute top-5 suggestions for each node"""
    def compute_top(node: TrieNode, prefix: str) -> list:
        candidates = []
        
        if node.is_end:
            candidates.append((node.frequency, prefix))
        
        for char, child in node.children.items():
            child_top = compute_top(child, prefix + char)
            candidates.extend(child_top)
        
        # Store top 5 at this node
        node.top_suggestions = heapq.nlargest(5, candidates)
        return node.top_suggestions  # propagate to parent
    
    compute_top(trie.root, "")
```

Now search is O(prefix_length) — just traverse to the prefix node and return cached suggestions.

## System architecture

### Data pipeline (offline)

```
Search logs (Kafka/Kinesis)
        │
    Aggregation job (Spark/Lambda)
    Every hour: count queries by prefix,
    filter profanity, apply frequency threshold
        │
    Build new Trie
    Serialize to binary (Avro/Protobuf) → S3
        │
    Deploy to Autocomplete Servers
    (atomic swap: load new trie, replace old)
```

### Request flow

```
User types "app" in search box
   → Browser debounces: wait 100ms after last keypress
   → GET /autocomplete?q=app
   → CDN check (cached response for popular prefixes)
      hit: return instantly
      miss: route to Autocomplete Service
   → Service: trie.search("app") → O(3) lookup
   → Return: ["apple", "app store", "apple music", "applebees", "application"]
```

```python
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import functools

app = FastAPI()

# Global trie (replaced atomically on hourly update)
current_trie: Trie = None

@app.get("/autocomplete")
async def autocomplete(q: str):
    if not q or len(q) > 100:
        return JSONResponse({"suggestions": []})
    
    prefix = q.lower().strip()
    suggestions = current_trie.search(prefix)
    
    return JSONResponse(
        content={"suggestions": suggestions},
        headers={
            "Cache-Control": f"public, max-age=300",  # cache 5 min at CDN
        }
    )
```

## Caching strategy

Not all prefixes are equally popular:

```
"the" → searched millions of times/day → cache at CDN edge for 5 min
"xylophon" → rarely searched → don't waste CDN space

Cache tiering:
  L1: CDN (CloudFront) — popular prefixes, TTL 5 min
  L2: Redis — all prefix results, TTL 1 hour
  L3: Trie in memory on each server — all prefixes, microseconds

For 26^1 + 26^2 + 26^3 = 18,278 possible 1-3 char prefixes
→ All pre-warmed in Redis on hourly trie update
```

```python
# Pre-warm cache on new trie deployment
async def pre_warm_cache(trie: Trie):
    # Pre-warm top N most queried prefixes
    popular_prefixes = await get_popular_prefixes(top_n=10000)
    
    pipe = redis.pipeline()
    for prefix in popular_prefixes:
        suggestions = trie.search(prefix)
        pipe.setex(f"autocomplete:{prefix}", 3600, json.dumps(suggestions))
    pipe.execute()
```

## Trie storage and distribution

The trie is built offline and deployed to servers:

```
Offline build (every hour):
  1. Aggregate search logs → query frequencies
  2. Build trie with top 5 cache at each node
  3. Serialize to binary (trie_2024-04-26-14:00.bin) → S3

Online serve (each autocomplete server):
  1. Poll S3 for new trie file (check last-modified every 5 min)
  2. Load new trie into memory (parallel to current trie)
  3. Atomic swap: new_trie becomes current_trie
  4. No downtime during update

Memory estimate:
  1M unique queries × avg 10 nodes × 200 bytes/node = ~2GB per trie
  Acceptable for dedicated autocomplete servers (r5.large: 16GB RAM)
```

## Distributed trie (if too large for single machine)

Split by first character or hash of first N characters:

```
Shard 1 (a-f): handles prefixes starting with a, b, c, d, e, f
Shard 2 (g-m): handles g, h, i, j, k, l, m
Shard 3 (n-s): handles n, o, p, q, r, s
Shard 4 (t-z): handles t, u, v, w, x, y, z

Client/Load balancer: route "app" → Shard 1, "the" → Shard 4

Simple range-based sharding works because:
- Predictable, no lookup needed
- Prefixes don't cross shard boundaries (same prefix always on same shard)
```

## Handling trending queries

For fast-breaking trends (e.g., "ChatGPT" blew up overnight):

```
Option 1: Hourly rebuild (simplest) — 1-hour lag
  → Acceptable for most use cases

Option 2: Hot trie update
  Monitor Kafka search stream in real-time
  Maintain separate "trending" map: {prefix: [trending_queries]}
  Merge trending results with trie results at query time
  Weight recent queries more heavily

Option 3: External trending signals
  Twitter/X trending topics
  Google Trends API
  Inject directly into suggestions for known popular prefixes
```

## AWS architecture

```
Search logs → Kinesis Data Streams → Spark on EMR (hourly)
                                           │
                                     S3 (trie binaries)
                                           │
CloudFront (cache top prefixes, 5min TTL)  │
     │                                     │
  ALB → Autocomplete Service (ECS Fargate) ←── poll S3 every 5min
              │                                 load new trie
         ElastiCache Redis (pre-warmed prefix cache, 1h TTL)
```

## Interview talking points

!!! tip "Key design decisions to discuss"
    1. Trie with cached top-5 at each node — O(prefix_length) lookup, not O(tree_size)
    2. Build offline (hourly), serve from memory — no DB calls during autocomplete
    3. CDN caches popular prefixes — most traffic never reaches your servers
    4. Atomic trie swap — update without downtime
    5. Shard by first character if trie grows beyond single machine RAM

## Related topics

- [Caching](../storage/caching.md) — multi-level caching strategy
- [CDN](../networking/cdn.md) — edge caching for popular prefixes
- [Search Engines](../storage/search-engines.md) — Elasticsearch as alternative for richer search
- [Consistent Hashing](../patterns/consistent-hashing.md) — if sharding the trie
