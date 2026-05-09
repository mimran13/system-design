# API-First Design

API-First is an architectural approach where you design and agree on the API contract *before* writing any implementation code. The API specification becomes the source of truth — from it you generate server stubs, client SDKs, mocks, documentation, and tests.

---

## The problem it solves

In a traditional code-first approach:

```
Backend team: writes code → discovers the API shape from the implementation
Frontend team: waits for backend to finish → starts building
Mobile team: waits longer → different API expectations
Result: friction, rework, integration surprises
```

In API-First:

```
All teams: agree on the OpenAPI spec in day 1
Backend team: generates server stubs → fills in business logic
Frontend team: generates mock server → starts building immediately
Mobile team: generates typed SDK → starts building immediately
Result: parallel development, no integration surprises
```

---

## OpenAPI Specification

OpenAPI (formerly Swagger) is the standard format for describing REST APIs.

```yaml
# openapi.yaml
openapi: 3.1.0
info:
  title: Order Service API
  version: 1.0.0

paths:
  /orders:
    post:
      summary: Place a new order
      operationId: createOrder
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateOrderRequest'
      responses:
        '201':
          description: Order created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '400':
          $ref: '#/components/responses/ValidationError'
        '422':
          $ref: '#/components/responses/BusinessError'

  /orders/{orderId}:
    get:
      summary: Get order by ID
      operationId: getOrder
      parameters:
        - name: orderId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Order found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '404':
          $ref: '#/components/responses/NotFound'

components:
  schemas:
    CreateOrderRequest:
      type: object
      required: [customerId, items]
      properties:
        customerId:
          type: string
          format: uuid
        items:
          type: array
          minItems: 1
          items:
            $ref: '#/components/schemas/OrderItem'

    Order:
      type: object
      properties:
        id:
          type: string
          format: uuid
        customerId:
          type: string
          format: uuid
        status:
          type: string
          enum: [draft, confirmed, shipped, delivered, cancelled]
        total:
          type: number
          format: double
        createdAt:
          type: string
          format: date-time

    OrderItem:
      type: object
      required: [productId, quantity]
      properties:
        productId:
          type: string
          format: uuid
        quantity:
          type: integer
          minimum: 1

  responses:
    ValidationError:
      description: Input validation failed
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
```

---

## Code generation

The spec drives everything. You generate rather than write:

```bash
# Generate Python server stub (FastAPI)
openapi-generator-cli generate \
  -i openapi.yaml \
  -g python-fastapi \
  -o ./server

# Generate TypeScript client
openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-fetch \
  -o ./client/src/api

# Generate Go client
openapi-generator-cli generate \
  -i openapi.yaml \
  -g go \
  -o ./go-client
```

Generated server stub (FastAPI):

```python
# Auto-generated — do not edit
from fastapi import FastAPI
from pydantic import BaseModel, UUID4
from typing import List
from enum import Enum

class OrderStatus(str, Enum):
    draft = "draft"
    confirmed = "confirmed"
    shipped = "shipped"

class CreateOrderRequest(BaseModel):
    customer_id: UUID4
    items: List[OrderItem]

class Order(BaseModel):
    id: UUID4
    customer_id: UUID4
    status: OrderStatus
    total: float
    created_at: datetime

app = FastAPI()

@app.post("/orders", response_model=Order, status_code=201)
async def create_order(request: CreateOrderRequest) -> Order:
    # TODO: implement
    raise NotImplementedError
```

Fill in the implementation, don't change the interface.

---

## Mock server for parallel development

While the backend implements, frontend uses a mock server generated from the spec:

```bash
# Run a mock server from the spec
npx @stoplight/prism-cli mock openapi.yaml --port 4010

# The mock server returns example responses
curl http://localhost:4010/orders/123e4567-e89b-12d3-a456-426614174000
# → returns a generated example Order object

# Frontend code points to mock until backend is ready
const API_BASE = process.env.REACT_APP_API_URL ?? "http://localhost:4010";
```

This means frontend and mobile teams can start building the day the spec is agreed upon — not the day the backend ships.

---

## Contract testing

Tests verify that the implementation matches the spec — catching drift before deployment.

```python
# schemathesis: auto-generates test cases from the OpenAPI spec
import schemathesis

schema = schemathesis.from_path("openapi.yaml", base_url="http://localhost:8000")

@schema.parametrize()
def test_api_matches_spec(case):
    """Auto-generated test: every endpoint, every status code"""
    response = case.call()
    case.validate_response(response)
    # Validates:
    # - Status code is defined in spec
    # - Response body matches schema
    # - Required fields are present
    # - Types are correct
```

```bash
# Run schemathesis against your live API
schemathesis run openapi.yaml --base-url http://localhost:8000
# Generates 100s of test cases automatically
```

---

## API design principles (within API-First)

### Versioning strategy

Decide upfront — it's hard to change later:

```yaml
# URL versioning (most common)
/v1/orders
/v2/orders

# Header versioning (clean URLs, harder to discover)
GET /orders
API-Version: 2024-01-01

# Content negotiation
Accept: application/vnd.company.v2+json
```

**Rule:** Never break backward compatibility within a version. Add new fields as optional; deprecate fields with a sunset header before removing.

```yaml
# Deprecation in OpenAPI
/v1/orders/{id}:
  get:
    deprecated: true
    description: "Deprecated. Use /v2/orders/{id}. Sunset: 2025-01-01."
```

### Resource modeling

```
# Good: noun-based resources
GET  /orders           → list orders
POST /orders           → create order
GET  /orders/{id}      → get order
PUT  /orders/{id}      → replace order
PATCH /orders/{id}     → partial update
DELETE /orders/{id}    → cancel order

# Avoid: verb-based (RPC-style)
POST /createOrder
POST /cancelOrder
POST /updateOrderStatus

# Exception: state transitions
POST /orders/{id}/confirm    → trigger business action
POST /orders/{id}/ship       → OK for actions with no natural resource
```

### Error responses

Consistent error structure across all services:

```yaml
ErrorResponse:
  type: object
  required: [code, message]
  properties:
    code:
      type: string
      description: "Machine-readable error code, e.g. ORDER_NOT_FOUND"
    message:
      type: string
      description: "Human-readable description"
    details:
      type: array
      items:
        type: object
        properties:
          field: {type: string}
          issue: {type: string}
    traceId:
      type: string
      description: "Correlates to distributed trace"
```

---

## The API-First workflow in a team

```
Week 1: API design
  Product, backend, frontend, mobile gather
  → Draft OpenAPI spec together
  → Review: does this model our domain correctly?
  → Review: does this meet frontend/mobile needs?
  → Agree and commit spec to Git

Week 1-2: Parallel development
  Backend:  generates server stub → implements business logic
  Frontend: starts mock server → builds UI against it
  Mobile:   generates typed SDK → builds app
  QA:       writes contract tests from spec

Week 3: Integration
  Backend deploys to dev env
  Frontend/mobile switch from mock to real backend
  Contract tests run in CI — catches any drift
  Surprises are minimal (spec was agreed upfront)
```

---

## API governance at scale

In a large org with dozens of services, API-First needs governance:

```
API Registry (e.g., Backstage, Apicurio):
  - Central catalog of all OpenAPI specs
  - Versioning and change history
  - Breaking change detection
  - Dependency graph: which services consume which APIs

Linting (Spectral, Vacuum):
  - Enforce naming conventions (/kebab-case vs /camelCase)
  - Require descriptions on all operations
  - Require examples for all schemas
  - Flag deprecated fields

CI/CD gates:
  - spec must lint-pass before merge
  - breaking changes require approval
  - consumer contract tests must pass before deployment
```

---

## gRPC and API-First

API-First applies equally to gRPC — the `.proto` file is the contract:

```protobuf
// order_service.proto — this IS the API contract
syntax = "proto3";
package orders.v1;

service OrderService {
  rpc CreateOrder(CreateOrderRequest) returns (Order);
  rpc GetOrder(GetOrderRequest) returns (Order);
  rpc ListOrders(ListOrdersRequest) returns (stream Order);  // server streaming
}

message CreateOrderRequest {
  string customer_id = 1;
  repeated OrderItem items = 2;
}

message Order {
  string id = 1;
  string customer_id = 2;
  OrderStatus status = 3;
  double total = 4;
  google.protobuf.Timestamp created_at = 5;
}

enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0;
  ORDER_STATUS_DRAFT = 1;
  ORDER_STATUS_CONFIRMED = 2;
  ORDER_STATUS_SHIPPED = 3;
}
```

```bash
# Generate server and client code from .proto
protoc --python_out=./server --grpc_python_out=./server order_service.proto
protoc --go_out=./client order_service.proto
protoc --java_out=./java-client order_service.proto
```

---

## Interview angle

!!! tip "API-First in system design"
    - *"How do you coordinate 5 teams building the same system?"* → API-First: define contracts upfront as OpenAPI specs. Teams develop in parallel against mock servers. Contract tests prevent integration surprises.
    - *"How do you handle API versioning without breaking clients?"* → Additive changes only (new optional fields). Version the URL (/v2/) for breaking changes. Deprecation period with sunset headers. Never remove a field without a version bump.
    - *"How do you catch API drift between spec and implementation?"* → Contract testing with Schemathesis or Pact in CI. If the implementation doesn't match the spec, the build fails.

## Related topics

- [API Design: REST](../api/rest.md) — REST principles and resource modeling
- [API Design: gRPC](../api/grpc.md) — Protobuf-based API-First
- [API Design: Versioning](../api/versioning.md) — version strategy in depth
- [Testing Strategies](../software-design/testing-strategies.md) — contract testing
- [Microservices Patterns](microservices-patterns.md) — where API-First fits in microservices
