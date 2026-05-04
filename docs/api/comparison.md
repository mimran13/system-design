# REST vs gRPC vs GraphQL

## When to use what

```
┌─────────────────────────────────────────────────────────────────┐
│                    API Style Decision                           │
│                                                                 │
│  External/Public API? ──Yes──► REST (universal, cacheable)     │
│          │                                                      │
│          No                                                     │
│          │                                                      │
│  Multiple clients with different data needs?                    │
│          │──Yes──► GraphQL (flexible, mobile-friendly)         │
│          │                                                      │
│          No                                                     │
│          │                                                      │
│  Internal microservice-to-microservice?                         │
│          │──Yes──► gRPC (fast, typed, streaming)               │
│          │                                                      │
│          No                                                     │
│          │                                                      │
│  Real-time bidirectional streaming?                             │
│          └──Yes──► gRPC (bidi streaming) or WebSockets         │
└─────────────────────────────────────────────────────────────────┘
```

## Head-to-head comparison

| Dimension | REST | gRPC | GraphQL |
|---|---|---|---|
| **Protocol** | HTTP/1.1 or HTTP/2 | HTTP/2 only | HTTP/1.1 or HTTP/2 |
| **Payload format** | JSON (text) | Protobuf (binary) | JSON (text) |
| **Schema / Contract** | OpenAPI (optional) | .proto (required) | SDL (required) |
| **Code generation** | Optional (openapi-gen) | Required (protoc) | Optional (codegen) |
| **Browser support** | Native | Requires gRPC-Web + proxy | Native |
| **Streaming** | SSE (server), no bidi | Full bidi streaming | Subscriptions (WebSocket) |
| **Caching** | HTTP cache, CDN | Not cacheable (POST) | Persisted queries only |
| **Performance** | Baseline | 5-10x faster | Similar to REST |
| **Tooling** | Excellent (Postman, curl) | Good (grpcurl, evans) | Excellent (GraphiQL, Apollo Studio) |
| **Learning curve** | Low | Medium | Medium-High |
| **Over-fetching** | Common problem | Common problem | Solved by design |
| **Versioning** | URL or header | Backward-compatible field addition | Schema evolution |
| **Type safety** | Optional | Enforced end-to-end | Enforced |
| **Error handling** | HTTP status codes | gRPC status codes | HTTP 200 + errors in body |

## REST

### Strengths

```
✓ Universal — every client speaks HTTP/JSON
✓ Browser native — no proxy, no special client
✓ CDN cacheable — GET requests cache at edge
✓ Debuggable — curl, browser DevTools, Postman
✓ Familiar — every engineer knows it
✓ Stateless by design
```

### Weaknesses

```
✗ Over-fetching — endpoint returns fixed shape
✗ Under-fetching — may need multiple requests for related data
✗ No real-time — SSE is server-only, no bidi
✗ Loose typing — JSON schema optional, often drifts from docs
✗ HTTP/1.1 performance — multiple connections, HOL blocking
```

### Best for

- Public APIs consumed by third parties
- Browser-facing APIs
- CRUD services with simple data models
- When CDN caching is critical (public content APIs)
- Teams/clients unfamiliar with the codebase (open ecosystem)

## gRPC

### Strengths

```
✓ Fast — protobuf binary 5-10x smaller/faster than JSON
✓ Streaming — server, client, and bidirectional
✓ Strong typing — compile-time contract enforcement
✓ Code generation — client SDKs in 11+ languages from one .proto
✓ Deadline propagation — cascading timeouts built in
✓ HTTP/2 — multiplexed connections, low latency
✓ Interceptors — auth, logging, retry as middleware
```

### Weaknesses

```
✗ No browser native support — needs gRPC-Web + Envoy proxy
✗ Not human-readable — binary format, harder to debug
✗ HTTP/2 required — some infrastructure doesn't support it
✗ Proto schema mandatory — more upfront setup
✗ Caching harder — no HTTP GET semantics
✗ Smaller ecosystem than REST
```

### Best for

- Internal microservice-to-microservice communication
- Polyglot environments (Go service calls Java service calls Python service)
- Real-time streaming (IoT telemetry, live feeds, chat)
- Performance-critical paths (high QPS, low latency SLOs)
- When you control all clients and servers

## GraphQL

### Strengths

```
✓ No over/under-fetching — clients request exactly what they need
✓ Single endpoint — one POST /graphql for all operations
✓ Self-documenting — introspection + GraphiQL
✓ Strong typing — schema enforced at runtime
✓ Rapid frontend iteration — add fields without backend changes
✓ Federation — compose multiple services into one graph
✓ Real-time — subscriptions via WebSocket
```

### Weaknesses

```
✗ N+1 problem — requires DataLoader (non-trivial)
✗ Caching complex — no URL-based caching, persisted queries needed
✗ Authorization per-field — not just per-endpoint
✗ Query complexity — must add depth/complexity limits
✗ Harder to debug — single endpoint, no HTTP semantics
✗ Overhead — schema parsing, query validation per request
✗ Versioning different — deprecate fields, never remove
```

### Best for

- Mobile apps with bandwidth constraints and diverse screens
- BFF (Backend for Frontend) layer
- Complex data graphs with many relationships
- Rapid product iteration (frontend needs new data shapes constantly)
- Public developer platforms where clients have diverse data needs

## Real-world patterns

### Pattern 1: REST external, gRPC internal

```
Mobile/Web Client
      │
      │ REST (JSON)
      ▼
  API Gateway
      │
      ├──gRPC──► Order Service
      │
      ├──gRPC──► Payment Service
      │
      └──gRPC──► User Service
```

Most common in modern microservices. REST for the public surface; gRPC for internal efficiency.

### Pattern 2: GraphQL BFF

```
Mobile App ──GraphQL──► Mobile BFF ──gRPC──► Order Service
                                    ──gRPC──► User Service
                                    ──REST──► Legacy Service

Web App ──GraphQL──► Web BFF ──gRPC──► same services
```

GraphQL aggregates across services. gRPC handles internal calls.

### Pattern 3: gRPC-Gateway (one proto, two interfaces)

```
.proto file
    │
    ├──protoc──► gRPC Server
    │               ▲
    │               │ gRPC (internal)
    │               │
    └──protoc──► gRPC-Gateway (REST proxy)
                    ▲
                    │ REST (external)
                    │
               External Clients
```

Single source of truth. REST and gRPC from the same `.proto`. Best when you want both but minimal duplication.

### Pattern 4: Apollo Federation

```
Client ──GraphQL──► Apollo Gateway
                        │
                    ┌───┴───────────┐
                    │               │
               User Graph      Order Graph
               (User Service)  (Order Service)
```

Microservices each own a slice of the graph. Gateway federates into one.

## Latency comparison

```
Scenario: Get order with 10 items (internal network)

REST (HTTP/1.1 + JSON):
  Serialize: ~200μs  │ Wire: ~500μs  │ Deserialize: ~200μs
  Total: ~900μs per call

gRPC (HTTP/2 + Protobuf):
  Serialize: ~30μs   │ Wire: ~200μs  │ Deserialize: ~30μs
  Total: ~260μs per call  (3.5x faster)

GraphQL (HTTP + JSON):
  Parse query: ~100μs │ Resolve: ~400μs │ Wire: ~500μs
  Total: ~1000μs (slower due to resolver overhead)
```

Wire time dominates for cross-region. Serialization dominates for high-QPS same-DC.

## Error handling comparison

```
REST:
  HTTP 404 Not Found
  {"error": "order not found", "code": "ORDER_NOT_FOUND"}

gRPC:
  Status: NOT_FOUND (5)
  Message: "order ord_123 not found"
  Details: [BadRequest, QuotaFailure, ...]

GraphQL:
  HTTP 200 OK
  {
    "data": {"order": null},
    "errors": [{"message": "order not found", "path": ["order"], "extensions": {"code": "NOT_FOUND"}}]
  }
```

GraphQL's HTTP 200 for errors is controversial — middleware and proxies may not handle errors correctly.

## Versioning comparison

```
REST:
  /v1/orders  → stable
  /v2/orders  → breaking changes, new major version
  Deprecate v1 with sunset header

gRPC / Protobuf:
  Never remove fields — mark deprecated: true
  Add new fields with new field numbers
  Reserved numbers for deleted fields
  # Fully backward compatible within major version

GraphQL:
  Never remove fields — mark @deprecated(reason: "use newField instead")
  Add new optional fields freely
  Schema introspection shows deprecations
  Breaking = removing/renaming required fields
```

## Interview cheat sheet

**"When would you use gRPC over REST?"**
> Internal service communication where performance matters, you need streaming, or you have polyglot services. REST when the client is a browser or third party.

**"Why is GraphQL useful for mobile?"**
> Mobile has limited bandwidth and many screen types. With REST, you'd over-fetch (get fields you don't need) or make multiple requests (waterfall). GraphQL lets the mobile client request exactly the fields it needs for each screen in one roundtrip.

**"What's the N+1 problem in GraphQL?"**
> If you query 100 orders and each order resolves its user via a separate DB call, you get 101 queries. DataLoader fixes this by batching all user loads into one query.

**"Can you use all three together?"**
> Yes — and often should. REST for external APIs, gRPC for internal, GraphQL as a BFF layer that aggregates and reshapes data for specific clients.

## Related topics

- [REST](rest.md) — REST deep dive
- [gRPC](grpc.md) — gRPC deep dive
- [GraphQL](graphql.md) — GraphQL deep dive
- [API Gateway](../networking/api-gateway.md) — where these styles meet the edge
- [Webhooks](webhooks.md) — event-driven API alternative
