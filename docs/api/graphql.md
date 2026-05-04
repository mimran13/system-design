# GraphQL

## What it is

GraphQL is a query language for APIs and a runtime for executing those queries. Clients specify exactly what data they need — no more, no less. Developed by Facebook in 2012, open-sourced in 2015.

```
REST (over-fetching):
GET /users/123
→ {id, name, email, phone, address, preferences, billing_info, ...}
   Client only needed name and email

GraphQL (precise):
query {
  user(id: "123") {
    name
    email
  }
}
→ {user: {name: "Alice", email: "alice@example.com"}}
   Exactly what was requested
```

## Core concepts

### Schema definition

Everything in GraphQL starts with the schema — the contract between client and server:

```graphql
# Schema Definition Language (SDL)

type Query {
  user(id: ID!): User
  users(first: Int, after: String): UserConnection!
  order(id: ID!): Order
  search(query: String!, filters: SearchFilters): SearchResult!
}

type Mutation {
  createOrder(input: CreateOrderInput!): CreateOrderPayload!
  cancelOrder(id: ID!): CancelOrderPayload!
  updateUser(id: ID!, input: UpdateUserInput!): User!
}

type Subscription {
  orderStatusChanged(orderId: ID!): OrderStatusEvent!
}

type User {
  id: ID!
  name: String!
  email: String!
  orders(status: OrderStatus): [Order!]!
  createdAt: DateTime!
}

type Order {
  id: ID!
  status: OrderStatus!
  items: [OrderItem!]!
  total: Money!
  user: User!
  createdAt: DateTime!
}

type OrderItem {
  product: Product!
  quantity: Int!
  price: Money!
}

type Product {
  id: ID!
  name: String!
  description: String
  price: Money!
  inventory: Int!
}

enum OrderStatus {
  PENDING
  CONFIRMED
  SHIPPED
  DELIVERED
  CANCELLED
}

scalar DateTime
scalar Money

input CreateOrderInput {
  items: [OrderItemInput!]!
  shippingAddressId: ID!
}

input OrderItemInput {
  productId: ID!
  quantity: Int!
}

type CreateOrderPayload {
  order: Order
  errors: [UserError!]!
}

type UserError {
  field: [String!]!
  message: String!
}
```

### Queries

Clients request exactly the shape they need:

```graphql
# Basic query
query GetUser {
  user(id: "usr_123") {
    name
    email
    orders(status: PENDING) {
      id
      total
      items {
        product {
          name
        }
        quantity
      }
    }
  }
}

# With variables (always use variables — never string interpolate)
query GetUser($userId: ID!) {
  user(id: $userId) {
    name
    email
  }
}
# Variables: {"userId": "usr_123"}

# Multiple resources in one request (vs multiple REST calls)
query DashboardData($userId: ID!) {
  user(id: $userId) {
    name
    email
  }
  recentOrders: user(id: $userId) {
    orders(first: 5) {
      id
      status
      total
    }
  }
}
```

### Mutations

```graphql
mutation CreateOrder($input: CreateOrderInput!) {
  createOrder(input: $input) {
    order {
      id
      status
      total
    }
    errors {
      field
      message
    }
  }
}
# Variables:
# {
#   "input": {
#     "items": [{"productId": "p_500", "quantity": 2}],
#     "shippingAddressId": "addr_789"
#   }
# }
```

### Subscriptions (real-time)

```graphql
subscription TrackOrder($orderId: ID!) {
  orderStatusChanged(orderId: $orderId) {
    orderId
    newStatus
    updatedAt
  }
}
```

Subscriptions use WebSockets (or SSE). The server pushes events when they occur.

### Fragments

Reusable field selections:

```graphql
fragment OrderFields on Order {
  id
  status
  total
  createdAt
}

query {
  order(id: "ord_123") {
    ...OrderFields
    items {
      quantity
    }
  }
}
```

## Resolvers

The server-side functions that fulfill each field in the schema:

```python
# Python (Strawberry)
import strawberry
from typing import Optional

@strawberry.type
class User:
    id: str
    name: str
    email: str
    
    @strawberry.field
    async def orders(self, status: Optional[OrderStatus] = None) -> list["Order"]:
        return await order_service.get_orders(user_id=self.id, status=status)

@strawberry.type
class Order:
    id: str
    status: OrderStatus
    
    @strawberry.field
    async def user(self) -> User:
        return await user_service.get_user(self.user_id)
    
    @strawberry.field
    async def items(self) -> list["OrderItem"]:
        return await order_service.get_items(self.id)

@strawberry.type
class Query:
    @strawberry.field
    async def user(self, id: str) -> Optional[User]:
        return await user_service.get_user(id)
    
    @strawberry.field
    async def order(self, id: str) -> Optional[Order]:
        return await order_service.get_order(id)

@strawberry.type
class Mutation:
    @strawberry.mutation
    async def create_order(self, input: CreateOrderInput) -> CreateOrderPayload:
        try:
            order = await order_service.create(input)
            return CreateOrderPayload(order=order, errors=[])
        except ValidationError as e:
            return CreateOrderPayload(order=None, errors=e.errors)

schema = strawberry.Schema(query=Query, mutation=Mutation)
```

## The N+1 problem

The most critical GraphQL performance issue:

```
Query:
{
  orders {         # 1 DB query → returns 100 orders
    user {         # 100 DB queries (one per order)!
      name
    }
  }
}

Total: 101 queries instead of 2
```

### DataLoader pattern (solution)

Batch individual loads into a single query:

```python
from strawberry.dataloader import DataLoader
from collections import defaultdict

async def load_users(user_ids: list[str]) -> list[User]:
    # One query for all user IDs
    users = await db.fetch_many("SELECT * FROM users WHERE id = ANY($1)", user_ids)
    user_map = {u.id: u for u in users}
    # Return in same order as input (DataLoader requirement)
    return [user_map.get(uid) for uid in user_ids]

# Register per-request DataLoader
user_loader = DataLoader(load_fn=load_users)

@strawberry.type
class Order:
    user_id: str
    
    @strawberry.field
    async def user(self) -> User:
        # DataLoader batches these across all concurrent resolutions
        return await user_loader.load(self.user_id)

# Result: 100 Order.user() calls → 1 batched DB query
```

**Timing:**
```
Without DataLoader: 101 sequential queries
With DataLoader: 2 queries (orders + batched users)
```

## Pagination

GraphQL Relay cursor spec is the standard:

```graphql
type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type UserEdge {
  node: User!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

query {
  users(first: 10, after: "cursor123") {
    edges {
      cursor
      node {
        id
        name
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

## Introspection

GraphQL schemas are self-documenting. Clients can query the schema itself:

```graphql
# Discover the schema
query {
  __schema {
    types {
      name
      kind
    }
  }
}

# Inspect a specific type
query {
  __type(name: "Order") {
    fields {
      name
      type {
        name
        kind
      }
    }
  }
}
```

Tools like GraphiQL and Apollo Studio use introspection to provide autocomplete and documentation. **Disable introspection in production** if API is not public — it reveals your entire data model.

## Authorization

GraphQL authorization happens in resolvers — not at the HTTP layer (one endpoint: `POST /graphql`).

```python
@strawberry.type
class Query:
    @strawberry.field
    async def order(self, id: str, info: strawberry.types.Info) -> Optional[Order]:
        order = await order_service.get_order(id)
        if order is None:
            return None
        
        # Field-level authorization
        user = info.context["user"]
        if order.user_id != user.id and not user.is_admin:
            raise PermissionError("Access denied")
        
        return order

# Directive-based authorization (cleaner)
@strawberry.type
class User:
    email: str
    
    @strawberry.field
    @login_required
    async def billing_info(self) -> BillingInfo:
        ...
    
    @strawberry.field
    @admin_required
    async def internal_notes(self) -> str:
        ...
```

### Field-level authorization challenge

A sensitive field (e.g., `User.email`) might be fine for account owners but not for public queries. Authorization must happen per-field, per-resolver — not just per-request.

## Persisted queries

For production, avoid sending full query strings — use persisted queries (APQ):

```
Without APQ:
  Client → {query: "query GetUser($id: ID!) { user(id: $id) { name email orders { ... } } }", variables: {...}}
  → Large payload on every request

With Automatic Persisted Queries (APQ):
  1. Client → {extensions: {persistedQuery: {sha256Hash: "abc123"}}}
  2. Server → {errors: [{message: "PersistedQueryNotFound"}]}
  3. Client → {query: "...", extensions: {persistedQuery: {sha256Hash: "abc123"}}}
  4. Server caches query by hash, returns result
  5. Future: Client → {extensions: {persistedQuery: {sha256Hash: "abc123"}}}  (tiny payload)
```

Benefits: smaller payloads, CDN caching (GET requests), prevents arbitrary query execution.

## Query complexity and depth limiting

Without limits, a malicious query can DoS your server:

```graphql
# Malicious deep query
{
  users {
    orders {
      user {
        orders {
          user {
            orders { ... }  # infinite depth → stack overflow
          }
        }
      }
    }
  }
}
```

```python
# Strawberry: add complexity/depth limits
schema = strawberry.Schema(
    query=Query,
    extensions=[
        QueryDepthLimiter(max_depth=10),
        QueryComplexityLimiter(max_complexity=100),
    ]
)

# Assign complexity per field
@strawberry.field(complexity=lambda: 10)
async def users(self) -> list[User]:
    ...
```

## Federation (microservices GraphQL)

Apollo Federation lets multiple GraphQL services compose into one unified graph:

```graphql
# User service schema
type User @key(fields: "id") {
  id: ID!
  name: String!
  email: String!
}

# Order service schema  
type Order @key(fields: "id") {
  id: ID!
  status: OrderStatus!
  user: User!  # extends User from user service
}

extend type User @key(fields: "id") {
  id: ID! @external
  orders: [Order!]!  # order service adds this field
}
```

```
Client → Apollo Gateway (federated) → routes sub-queries to:
           ├── User Service (name, email)
           └── Order Service (orders, status)
```

The gateway stitches responses into a single result. Services evolve independently.

## AWS context

| Need | Solution |
|---|---|
| Managed GraphQL | AWS AppSync — fully managed GraphQL with real-time subscriptions |
| AppSync resolvers | DynamoDB, Lambda, HTTP, RDS, OpenSearch direct resolvers |
| AppSync real-time | WebSocket-based subscriptions, no server management |
| Custom server | ECS/Lambda with Apollo Server or Strawberry |
| Caching | AppSync server-side caching per resolver; Elasticache for custom servers |

```graphql
# AppSync direct DynamoDB resolver (no Lambda needed)
# vtl/Query.getOrder.req.vtl
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "id": $util.dynamodb.toDynamoDBJson($ctx.args.id)
  }
}
```

## Interview angle

!!! tip "When GraphQL comes up"
    Usually in "mobile app + complex data" or "BFF pattern" discussions.

**Strong answer pattern:**
1. GraphQL solves over-fetching and under-fetching — clients get exactly what they need
2. One endpoint, flexible queries — ideal for mobile (different views, bandwidth sensitivity)
3. N+1 problem is real — always use DataLoader in production
4. Schema = contract — introspection enables tooling, type safety across client/server
5. For microservices: Apollo Federation or API Gateway BFF are the patterns
6. Cost: complex tooling, authorization per-field, query analysis needed

## Related topics

- [REST](rest.md) — the simpler alternative for most APIs
- [REST vs gRPC vs GraphQL](comparison.md) — decision guide
- [API Gateway](../networking/api-gateway.md) — BFF pattern using GraphQL
- [WebSockets & SSE](../networking/websockets-sse.md) — GraphQL subscriptions transport
- [Caching](../storage/caching.md) — GraphQL caching challenges (POST, dynamic queries)
