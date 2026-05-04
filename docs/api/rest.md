# REST

## What it is

REST (Representational State Transfer) is an architectural style for building distributed hypermedia systems. Defined by Roy Fielding in his 2000 dissertation. "RESTful" APIs use HTTP as the application protocol, treating resources as the first-class concept.

## Core constraints

### 1. Client-Server

Separation of concerns: client handles UI, server handles data storage. They evolve independently.

### 2. Stateless

Each request contains all information needed to serve it. Server holds no client session state.

```http
# Stateful (BAD): server remembers context
GET /cart/add?item=123  ← Server knows who you are from session
Session: abc123

# Stateless (GOOD): client sends all context
POST /carts/{cart_id}/items
Authorization: Bearer eyJhbGci...
{ "product_id": 123, "quantity": 1 }
```

### 3. Cacheable

Responses must label themselves cacheable or non-cacheable. Enables CDN and browser caching.

### 4. Uniform Interface

Four sub-constraints:
- **Resource identification:** Resources identified by URIs
- **Manipulation through representations:** Client manipulates resources through representations (JSON, XML)
- **Self-descriptive messages:** Each message includes enough info to describe how to process it
- **HATEOAS:** Hypermedia as the Engine of Application State (responses include links to related actions)

### 5. Layered System

Client can't tell if it's talking to the origin server or an intermediary (CDN, API Gateway, load balancer).

### 6. Code on Demand (optional)

Server can extend client functionality by sending executable code (JavaScript).

## HTTP methods and semantics

| Method | Semantic | Idempotent | Safe | Body |
|---|---|---|---|---|
| GET | Retrieve resource | Yes | Yes | No |
| POST | Create / process | No | No | Yes |
| PUT | Replace resource | Yes | No | Yes |
| PATCH | Partial update | No | No | Yes |
| DELETE | Remove resource | Yes | No | No |
| HEAD | GET without body | Yes | Yes | No |
| OPTIONS | Describe options | Yes | Yes | No |

**Safe:** Does not modify state. Can be cached.  
**Idempotent:** Multiple identical requests = same effect as one.

## Resource modeling

Resources are nouns, not verbs. HTTP methods are the verbs.

```
❌ Verb-based (RPC-style):
  POST /getUser
  POST /createOrder
  POST /deleteProduct

✅ Resource-based (RESTful):
  GET    /users/{id}
  POST   /orders
  DELETE /products/{id}
```

### Nested resources

```
GET  /users/{user_id}/orders           ← user's orders
GET  /users/{user_id}/orders/{id}      ← specific order
POST /users/{user_id}/orders           ← create order for user
```

**Avoid deep nesting** (>2 levels). For a deeply nested resource, consider flattening:

```
✅ GET /orders/{order_id}/items/{item_id}  (2 levels ok)
❌ GET /users/{uid}/orders/{oid}/items/{iid}/reviews/{rid}  (too deep)
✅ GET /reviews/{rid}  (flatten to top-level)
```

### Actions that don't map cleanly to CRUD

```
# Activate an account (action, not a resource)
POST /accounts/{id}/activate

# Transfer money (action with side effects)
POST /transfers
{ "from": "acc_1", "to": "acc_2", "amount": 100 }

# Search (complex query, use POST if body needed)
POST /products/search
{ "query": "keyboard", "filters": {...}, "sort": "price_asc" }
```

## HTTP status codes

| Range | Meaning |
|---|---|
| 2xx | Success |
| 3xx | Redirection |
| 4xx | Client error (fix your request) |
| 5xx | Server error (try again later) |

**Most important:**

| Code | When to use |
|---|---|
| 200 OK | Request succeeded with response body |
| 201 Created | Resource created. Include `Location` header |
| 204 No Content | Success, no body (DELETE, PUT) |
| 301 Moved Permanently | Permanent redirect. Browser caches |
| 302 Found | Temporary redirect |
| 400 Bad Request | Invalid request syntax or semantics |
| 401 Unauthorized | Not authenticated |
| 403 Forbidden | Authenticated but not authorized |
| 404 Not Found | Resource doesn't exist |
| 409 Conflict | State conflict (duplicate, optimistic lock failure) |
| 422 Unprocessable Entity | Validation error |
| 429 Too Many Requests | Rate limit exceeded |
| 500 Internal Server Error | Unexpected server error |
| 503 Service Unavailable | Server temporarily unavailable |

## Request/Response design

### Request body

```json
POST /orders
Content-Type: application/json

{
    "user_id": "usr_123",
    "items": [
        { "product_id": "p_500", "quantity": 2 }
    ],
    "shipping_address": {
        "street": "123 Main St",
        "city": "Springfield",
        "country": "US"
    }
}
```

### Response body

```json
HTTP/1.1 201 Created
Location: /orders/ord_8821
Content-Type: application/json

{
    "id": "ord_8821",
    "status": "pending",
    "total": 29.98,
    "items": [...],
    "created_at": "2024-04-26T14:00:00Z",
    "_links": {
        "self": { "href": "/orders/ord_8821" },
        "cancel": { "href": "/orders/ord_8821", "method": "DELETE" },
        "user": { "href": "/users/usr_123" }
    }
}
```

### Error response

```json
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json

{
    "type": "https://errors.example.com/validation-error",
    "title": "Validation Error",
    "status": 422,
    "detail": "The request body contains invalid data",
    "errors": [
        {
            "field": "items[0].quantity",
            "message": "Quantity must be greater than 0"
        },
        {
            "field": "shipping_address.country",
            "message": "Country code must be ISO 3166-1 alpha-2"
        }
    ],
    "instance": "/orders",
    "trace_id": "7f9e4321-1234-4abc-8def"
}
```

## Pagination

Always paginate collection endpoints:

```http
GET /orders?limit=20&cursor=eyJpZCI6Ijk5OSJ9

Response:
{
    "data": [...],
    "pagination": {
        "next_cursor": "eyJpZCI6IjExOSJ9",
        "has_more": true,
        "total": 1500
    }
}
```

See [Pagination](pagination.md) for full coverage (cursor vs offset).

## API versioning

```http
# URI versioning (most common):
GET /v1/orders
GET /v2/orders

# Header versioning:
GET /orders
Accept: application/vnd.example.v2+json

# Query parameter (avoid):
GET /orders?version=2
```

See [API Versioning](versioning.md) for full coverage.

## REST API design checklist

```
□ Use nouns for resources, HTTP methods for actions
□ Consistent naming: plural for collections (/orders, /users)
□ Proper HTTP status codes (201 for create, 204 for no content)
□ Pagination for all collection endpoints
□ Consistent error format with enough detail to debug
□ API versioning strategy defined upfront
□ Rate limit headers (X-RateLimit-Remaining, X-RateLimit-Reset)
□ Idempotency keys for POST requests that should be idempotent
□ Consistent date format (ISO 8601: 2024-04-26T14:00:00Z)
□ Consistent ID format (UUID or prefixed: order_8821)
□ HTTPS only
□ CORS headers for browser clients
```

## REST API documentation

**OpenAPI 3.0** (formerly Swagger) is the standard:

```yaml
openapi: "3.0.3"
info:
  title: Order API
  version: "1.0"
paths:
  /orders:
    post:
      summary: Create an order
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateOrderRequest'
      responses:
        '201':
          description: Order created
          headers:
            Location:
              description: URL of created order
              schema: { type: string }
```

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you design clean, consistent APIs — not just know the definition of REST.

**Strong answer pattern:**
1. Resources, not verbs — name endpoints around nouns
2. Proper HTTP methods with correct idempotency semantics
3. Consistent error format with trace IDs
4. Pagination for collections
5. Rate limit headers + idempotency keys for mutations

## Related topics

- [gRPC](grpc.md) — alternative for internal services
- [GraphQL](graphql.md) — alternative for flexible client queries
- [REST vs gRPC vs GraphQL](comparison.md) — decision guide
- [API Gateway](../networking/api-gateway.md) — REST API entry point
- [Pagination](pagination.md) — cursor vs offset
