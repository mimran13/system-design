# Pagination

## Why pagination matters

Never return unbounded collections. A table with 10M orders can't be returned in one response — it would timeout, exhaust memory, and crush the client.

```
GET /orders → returns 10,000,000 rows
  → response body: 500MB
  → server time: 30 seconds
  → client: crashes
  
GET /orders?limit=20&cursor=... → returns 20 rows
  → response body: 5KB
  → server time: 5ms
  → client: renders instantly
```

## Offset pagination

The simplest approach: skip N rows, take M.

```http
GET /orders?limit=20&offset=0   → rows 1-20
GET /orders?limit=20&offset=20  → rows 21-40
GET /orders?limit=20&offset=40  → rows 41-60
```

```python
@app.get("/orders")
async def list_orders(limit: int = 20, offset: int = 0):
    if limit > 100:
        raise HTTPException(400, "limit must be <= 100")
    
    orders = await db.fetch(
        "SELECT * FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        limit, offset
    )
    total = await db.fetchval("SELECT COUNT(*) FROM orders")
    
    return {
        "data": [serialize(o) for o in orders],
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + limit < total,
        }
    }
```

### Response

```json
{
    "data": [...],
    "pagination": {
        "total": 1500,
        "limit": 20,
        "offset": 0,
        "has_more": true
    }
}
```

### Problems with offset pagination

**1. Page drift (new inserts)**

```
Client loads page 1 (offset=0, limit=20) → gets items 1-20
New item inserted at position 1
Client loads page 2 (offset=20, limit=20) → gets items 21-40
  → But item 20 (old) is now at position 21
  → Item 20 appears again on page 2 (duplicate!)

Or:
Client loads page 1 → item deleted from position 10
Client loads page 2 (offset=20) → old item 21 is now at position 20
  → Item 20 is skipped entirely (gap!)
```

**2. Deep offset is slow**

```sql
-- "OFFSET 100000 LIMIT 20" forces DB to scan and discard 100,000 rows
SELECT * FROM orders ORDER BY created_at DESC LIMIT 20 OFFSET 100000;
-- Full index scan of 100,020 rows → very slow for large tables
```

**3. Inconsistent COUNT(*)**

`SELECT COUNT(*)` is often slow on large tables (full scan in PostgreSQL without a covering index).

### When offset is fine

- Small datasets (< 10,000 rows)
- Admin tools / one-time exports where consistency doesn't matter
- When users need to jump to "page 50"
- Simple reporting queries

## Cursor-based pagination

Instead of "skip N rows," use a pointer to the last seen item. The cursor encodes position.

```http
GET /orders                                → first page
GET /orders?cursor=eyJpZCI6IjEwMCJ9       → next page (cursor from previous response)
GET /orders?cursor=eyJpZCI6IjgwIn0=       → next page
```

```python
import base64
import json

def encode_cursor(order_id: str, created_at: datetime) -> str:
    payload = {"id": order_id, "created_at": created_at.isoformat()}
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()

def decode_cursor(cursor: str) -> dict:
    try:
        return json.loads(base64.urlsafe_b64decode(cursor))
    except Exception:
        raise HTTPException(400, "invalid cursor")

@app.get("/orders")
async def list_orders(limit: int = 20, cursor: str = None):
    if limit > 100:
        raise HTTPException(400, "limit must be <= 100")
    
    if cursor:
        decoded = decode_cursor(cursor)
        # Use WHERE clause instead of OFFSET
        orders = await db.fetch("""
            SELECT * FROM orders
            WHERE (created_at, id) < ($1, $2)
            ORDER BY created_at DESC, id DESC
            LIMIT $3
        """, decoded["created_at"], decoded["id"], limit + 1)
    else:
        orders = await db.fetch("""
            SELECT * FROM orders
            ORDER BY created_at DESC, id DESC
            LIMIT $1
        """, limit + 1)
    
    # Fetch one extra to detect has_more
    has_more = len(orders) > limit
    if has_more:
        orders = orders[:limit]
    
    next_cursor = None
    if has_more and orders:
        last = orders[-1]
        next_cursor = encode_cursor(str(last.id), last.created_at)
    
    return {
        "data": [serialize(o) for o in orders],
        "pagination": {
            "next_cursor": next_cursor,
            "has_more": has_more,
        }
    }
```

### Why cursor pagination is fast

```sql
-- Offset: must scan and discard 100,000 rows
SELECT * FROM orders ORDER BY created_at DESC LIMIT 20 OFFSET 100000;

-- Cursor: index seek directly to position
SELECT * FROM orders
WHERE (created_at, id) < ('2024-04-26T10:00:00', 'ord_100')
ORDER BY created_at DESC, id DESC
LIMIT 20;
-- Uses index on (created_at DESC, id DESC) → O(log N) seek + O(limit) scan
```

**Required index:**
```sql
CREATE INDEX idx_orders_pagination ON orders (created_at DESC, id DESC);
```

### Handling ties

Using a single timestamp cursor breaks when multiple records have identical `created_at`:

```
orders with same created_at:
  ord_300, 2024-04-26T10:00:00
  ord_301, 2024-04-26T10:00:00  ← same timestamp
  ord_302, 2024-04-26T10:00:00  ← same timestamp

Cursor: "created_at < 2024-04-26T10:00:00"
→ skips all three!
```

Fix: use a composite cursor `(created_at, id)` as shown above. The compound `WHERE (created_at, id) < ($1, $2)` handles ties correctly.

## Keyset pagination (DynamoDB / NoSQL)

For DynamoDB (which doesn't support OFFSET):

```python
import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("orders")

def list_orders(user_id: str, limit: int = 20, last_evaluated_key: dict = None):
    params = {
        "IndexName": "user-id-created-at-index",
        "KeyConditionExpression": Key("user_id").eq(user_id),
        "Limit": limit,
        "ScanIndexForward": False,  # descending order
    }
    
    if last_evaluated_key:
        params["ExclusiveStartKey"] = last_evaluated_key
    
    response = table.query(**params)
    
    return {
        "data": response["Items"],
        "pagination": {
            "next_key": response.get("LastEvaluatedKey"),  # None if last page
            "has_more": "LastEvaluatedKey" in response,
        }
    }

# Response
{
    "data": [...],
    "pagination": {
        "next_key": {"user_id": "usr_123", "created_at": "2024-04-26T10:00:00Z", "id": "ord_100"},
        "has_more": true
    }
}
```

DynamoDB's `LastEvaluatedKey` is its built-in cursor — use it directly.

## Relay cursor spec (GraphQL)

The standard GraphQL pagination pattern:

```graphql
type OrderConnection {
  edges: [OrderEdge!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type OrderEdge {
  node: Order!
  cursor: String!   # opaque cursor for this item
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

type Query {
  orders(
    first: Int        # forward pagination: take first N
    after: String     # forward pagination: after cursor
    last: Int         # backward pagination: take last N
    before: String    # backward pagination: before cursor
  ): OrderConnection!
}
```

```graphql
query {
  orders(first: 20) {
    edges {
      cursor
      node {
        id
        status
        total
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}

# Next page:
query {
  orders(first: 20, after: "eyJpZCI6IjEwMCJ9") {
    ...
  }
}
```

## Search-after pagination (Elasticsearch)

Elasticsearch equivalent of cursor pagination:

```json
POST /orders/_search
{
  "size": 20,
  "sort": [
    {"created_at": "desc"},
    {"_id": "desc"}
  ]
}
→ Response includes "sort" values for last hit

# Next page: use sort values from last hit as search_after
POST /orders/_search
{
  "size": 20,
  "sort": [
    {"created_at": "desc"},
    {"_id": "desc"}
  ],
  "search_after": ["2024-04-26T10:00:00Z", "ord_100"]
}
```

**Never use `from`/`size` for deep pagination in Elasticsearch** — it fetches and discards, and hits the default 10,000 limit.

## Comparison

| Feature | Offset | Cursor | Keyset |
|---|---|---|---|
| **Random access** | Yes (`offset=500`) | No | No |
| **Page drift** | Yes (duplicates/gaps) | No | No |
| **Deep page perf** | Degrades (O(offset)) | Consistent (O(log N)) | Consistent |
| **Total count** | Easy (COUNT(*)) | Expensive | Expensive |
| **Backward nav** | Yes (offset - limit) | Requires prev_cursor | No (usually) |
| **Implementation** | Simple | Medium | Simple (DB-native) |
| **Best for** | Admin, reports, small data | Infinite scroll, feeds | DynamoDB, Elasticsearch |

## Choosing the page size

```
Default: 20-50 items
Maximum: 100-200 items (enforce server-side)
Never: unlimited (no limit parameter)

Too small: many round trips, poor UX
Too large: slow responses, high memory pressure
```

```python
# Always enforce server-side limits
@app.get("/orders")
async def list_orders(limit: int = 20):
    limit = min(limit, 100)  # cap at 100 regardless of request
    ...
```

## Total count considerations

```
Returning total count:
  ✓ Required for "showing page X of Y" UIs
  ✓ Required for progress indicators
  ✗ SELECT COUNT(*) is expensive (full scan) on large tables
  ✗ Count changes between requests (inconsistent)

Alternatives:
  1. Approximate count: pg_class.reltuples (PostgreSQL estimate) — fast but rough
  2. Cached count: increment/decrement in Redis on insert/delete
  3. Skip total count: just return has_more — sufficient for infinite scroll
  4. Async count: return estimated count immediately, exact count via separate call
```

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you understand that naive pagination breaks at scale.

**Strong answer pattern:**
1. Always paginate — never return unbounded collections
2. Cursor-based for production — no page drift, consistent performance at depth
3. Offset for admin/reports where random access is needed and data is small
4. DynamoDB uses LastEvaluatedKey — it's cursor pagination native to the DB
5. Total count is expensive — omit or approximate for large collections

## Related topics

- [REST](rest.md) — pagination in REST API design
- [GraphQL](graphql.md) — Relay cursor spec
- [Key-Value Stores](../storage/key-value-stores.md) — DynamoDB pagination
- [Search Engines](../storage/search-engines.md) — Elasticsearch search_after
- [Relational Databases](../storage/relational-databases.md) — index design for cursor pagination
