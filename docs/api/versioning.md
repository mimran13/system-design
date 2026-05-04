# API Versioning

## Why versioning matters

APIs are contracts. Once published, clients depend on the exact shape of responses, field names, and semantics. Changes break clients.

```
Breaking changes (require a version bump):
  ✗ Removing a field or endpoint
  ✗ Renaming a field
  ✗ Changing a field type (string → int)
  ✗ Changing HTTP method (GET → POST)
  ✗ Making an optional field required
  ✗ Changing error codes or response structure
  ✗ Removing enum values

Non-breaking changes (backward compatible):
  ✓ Adding new optional fields
  ✓ Adding new endpoints
  ✓ Adding new optional parameters
  ✓ Adding new enum values (usually)
  ✓ Relaxing validation constraints
```

## Versioning strategies

### 1. URI versioning (most common)

```http
GET /v1/orders/ord_123
GET /v2/orders/ord_123
```

```python
from fastapi import FastAPI
from fastapi import APIRouter

app = FastAPI()

v1 = APIRouter(prefix="/v1")
v2 = APIRouter(prefix="/v2")

@v1.get("/orders/{order_id}")
async def get_order_v1(order_id: str):
    order = await db.get_order(order_id)
    return {
        "id": order.id,
        "status": order.status,
        "amount": order.amount_cents / 100,  # v1: dollars as float
    }

@v2.get("/orders/{order_id}")
async def get_order_v2(order_id: str):
    order = await db.get_order(order_id)
    return {
        "id": order.id,
        "status": order.status,
        "amount_cents": order.amount_cents,  # v2: explicit cents, no float
        "currency": order.currency,           # v2: new field
    }

app.include_router(v1)
app.include_router(v2)
```

**Pros:**
- Explicit and visible — developers can see the version in the URL
- Easy to route at the load balancer or API gateway level
- Easy to document separately
- Can run different versions on different servers

**Cons:**
- URIs should represent resources, not API versions (purists argue this)
- Can accumulate many versions over time
- Clients must update URLs when upgrading

### 2. Header versioning

```http
GET /orders/ord_123
Accept: application/vnd.example.v2+json

# Or custom header:
GET /orders/ord_123
API-Version: 2024-04-01
```

```python
from fastapi import Request

@app.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    version = request.headers.get("API-Version", "2023-01-01")
    order = await db.get_order(order_id)
    
    if version >= "2024-04-01":
        return format_v2(order)
    return format_v1(order)
```

**Pros:**
- Clean URLs — resource URI doesn't change
- Follows HTTP content negotiation semantics
- Can use date-based versions (Stripe's model)

**Cons:**
- Less discoverable — version not visible in URL or browser
- Harder to test (must set headers in every request)
- Caching requires `Vary: Accept` or `Vary: API-Version` header

### 3. Query parameter versioning (avoid)

```http
GET /orders/ord_123?version=2
GET /orders/ord_123?api-version=2024-04-01
```

**Cons:**
- Breaks caching — query params included in cache key (unpredictably)
- Easy to forget — clients may omit the parameter
- Mixes resource addressing with API metadata
- Generally considered an anti-pattern

### 4. Date-based versioning (Stripe model)

Instead of incrementing integers, use dates. Clients pin to the API that was current on their integration date:

```
Stripe-Version: 2024-04-10
```

```python
# API behavior based on version date
def serialize_order(order, api_version: str):
    base = {
        "id": order.id,
        "status": order.status,
    }
    
    if api_version >= "2024-01-01":
        base["amount_cents"] = order.amount_cents
        base["currency"] = order.currency
    else:
        base["amount"] = order.amount_cents / 100  # legacy format
    
    if api_version >= "2024-04-10":
        base["metadata"] = order.metadata  # new field
    
    return base
```

**Stripe's approach:**
- New API customers always get the latest version
- Existing customers stay pinned to their integration date version
- Dashboard lets you test the latest version before upgrading
- Changes are additive when possible; breaking changes require version bump

## Sunset and deprecation

Don't just delete old versions — signal deprecation first:

```http
# Deprecation warning headers (RFC 8594)
HTTP/1.1 200 OK
Deprecation: Sun, 01 Sep 2024 00:00:00 GMT
Sunset: Sun, 01 Mar 2025 00:00:00 GMT
Link: <https://api.example.com/v2/orders>; rel="successor-version"
```

```python
from datetime import datetime, timezone

V1_SUNSET_DATE = datetime(2025, 3, 1, tzinfo=timezone.utc)

@v1.get("/orders/{order_id}")
async def get_order_v1(order_id: str, response: Response):
    # Add deprecation headers on all v1 responses
    response.headers["Deprecation"] = "Sun, 01 Sep 2024 00:00:00 GMT"
    response.headers["Sunset"] = V1_SUNSET_DATE.strftime("%a, %d %b %Y %H:%M:%S GMT")
    response.headers["Link"] = '</v2/orders>; rel="successor-version"'
    
    # Log usage for migration tracking
    metrics.increment("api.v1.orders.usage")
    
    return await get_order(order_id, version="v1")
```

**Deprecation timeline:**
```
Announce deprecation → 6-12 months → Sunset (hard removal)

Week 0:   Announce deprecation, publish migration guide
Week 1:   Add Deprecation + Sunset headers
Ongoing:  Monitor v1 usage, reach out to heavy users
Month 6:  Start returning warnings in response body (optional)
Month 12: Remove v1
```

## Managing multiple versions

### Code organization approaches

**Approach 1: Shared core, version adapters (recommended)**

```
api/
├── v1/
│   └── orders.py       # v1 formatters/validators
├── v2/
│   └── orders.py       # v2 formatters/validators
└── core/
    └── orders.py       # shared business logic
```

```python
# core/orders.py — shared logic
async def get_order(order_id: str) -> Order:
    return await db.find_order(order_id)

# v1/orders.py — v1 representation
def serialize_order_v1(order: Order) -> dict:
    return {"id": order.id, "amount": order.amount_cents / 100}

# v2/orders.py — v2 representation
def serialize_order_v2(order: Order) -> dict:
    return {"id": order.id, "amount_cents": order.amount_cents, "currency": order.currency}
```

**Approach 2: If-version branching (risky, grows complex)**

```python
# Avoid — hard to maintain as versions multiply
async def get_order(order_id: str, version: str):
    order = await db.find_order(order_id)
    
    if version == "v1":
        return {"amount": order.amount_cents / 100}
    elif version == "v2":
        return {"amount_cents": order.amount_cents}
    elif version == "v3":
        return {"amount_cents": order.amount_cents, "currency": order.currency}
    # Adding v4 means touching this function again
```

### API Gateway routing by version

```yaml
# AWS API Gateway / Kong / NGINX routing
routes:
  - path: /v1/*
    upstream: order-service-v1:8080
  
  - path: /v2/*
    upstream: order-service-v2:8080  # separate deployment
```

Separate deployments let you retire v1 infrastructure entirely once usage drops to zero.

## GraphQL versioning

GraphQL has no URL versions. Use field deprecation:

```graphql
type Order {
  id: ID!
  
  # v1 field — deprecated
  amount: Float @deprecated(reason: "Use amountCents instead. Float precision issues.")
  
  # v2 field — preferred
  amountCents: Int!
  currency: String!
}
```

```graphql
# Client query — can still use deprecated field
{
  order(id: "ord_123") {
    id
    amount      # ← client sees deprecation warning in tooling
    amountCents # ← preferred
  }
}
```

Schema evolution rules:
- Add fields freely
- Deprecate fields, never remove (or with very long notice)
- Never change field types

## Protobuf / gRPC versioning

Protobuf is designed for backward compatibility:

```protobuf
// order.proto — add fields, never remove or reuse numbers
message Order {
  string id = 1;
  string status = 2;
  
  // Added in v2 — old clients ignore unknown fields
  string currency = 3;
  int64 amount_cents = 4;
  
  // Field 5 was deleted — reserve the number!
  reserved 5;
  reserved "old_amount_float";
  
  // Added in v3
  repeated string tags = 6;
}
```

Rules for backward compatibility:
- Add new fields with new numbers
- Never reuse field numbers (data corruption)
- `reserved` for deleted fields
- Use `optional` for fields that may not be present

Breaking change = new package version:

```protobuf
package order.v1;  // current
package order.v2;  // breaking change (new proto file)
```

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you think about the API as a long-lived contract, not just today's implementation.

**Strong answer pattern:**
1. URI versioning is the pragmatic choice — explicit, easy to route, easy to document
2. Define a deprecation policy upfront — Sunset header + 6-12 month notice
3. Non-breaking changes (additive) don't need a version bump
4. Keep backward compatibility as long as usage justifies it
5. Stripe's date-based versioning is excellent for platforms with many external integrators

## Related topics

- [REST](rest.md) — REST API design including versioning section
- [gRPC](grpc.md) — protobuf backward compatibility
- [GraphQL](graphql.md) — GraphQL schema evolution
- [API Gateway](../networking/api-gateway.md) — route traffic by version
