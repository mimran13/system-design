# Layered Architecture (N-Tier)

The most foundational architectural pattern — the starting point from which Hexagonal, Clean Architecture, and DDD all evolved. If you work in any non-trivial software system, you're working in some variant of this.

---

## What it is

Layered architecture organizes code into horizontal layers, where each layer has a specific responsibility and can only communicate with the layer directly below it. Dependencies flow strictly downward.

```
┌──────────────────────────────────┐
│        Presentation Layer        │  HTTP handlers, REST controllers, CLI, views
│   (What the user or client sees) │
├──────────────────────────────────┤
│         Business Layer           │  Use cases, domain rules, workflows
│   (What the system does)         │  = "Application Layer" or "Service Layer"
├──────────────────────────────────┤
│        Persistence Layer         │  Repositories, DAOs, ORM queries
│   (How data is read/written)     │
├──────────────────────────────────┤
│        Database Layer            │  PostgreSQL, MySQL, MongoDB
│   (Where data lives)             │
└──────────────────────────────────┘

Dependency direction: top → bottom
Presentation depends on Business
Business depends on Persistence
Persistence depends on Database

NEVER: bottom layer importing from top layer
```

---

## 3-Tier: The Classic Form

The most common variant — separates concerns into three deployable tiers:

```
Tier 1 — Presentation (Client)
  Web browser, mobile app, desktop client
  Sends HTTP requests, renders responses
  Deployed on: user's device / CDN

Tier 2 — Application (Server)
  Business logic, validation, orchestration
  Processes requests, applies rules, talks to DB
  Deployed on: EC2, ECS, Lambda, etc.

Tier 3 — Data (Database)
  Stores and retrieves data
  Deployed on: RDS, DynamoDB, etc.
```

"Tier" = physical deployment boundary. "Layer" = logical code boundary. A 3-tier app has 3 tiers, but the application tier typically still has multiple layers (controllers, services, repositories).

---

## The 4-layer pattern in code

Most production backends implement 4 logical layers within the application tier:

```python
# Layer 1: Presentation — HTTP concerns only
# routes/order_routes.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.order_service import OrderService

router = APIRouter()

class CreateOrderRequest(BaseModel):
    customer_id: str
    items: list[dict]

@router.post("/orders")
async def create_order(body: CreateOrderRequest, service: OrderService = Depends()):
    try:
        order = service.create_order(body.customer_id, body.items)
        return {"order_id": order.id, "total": order.total}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# Presentation layer ONLY:
# - Parses HTTP request
# - Validates request shape (Pydantic)
# - Calls service
# - Maps result to HTTP response
# - Handles HTTP-specific errors (400, 404, 500)
# - Never contains business rules
```

```python
# Layer 2: Business / Service — domain rules and orchestration
# services/order_service.py
from repositories.order_repository import OrderRepository
from repositories.inventory_repository import InventoryRepository
from models.order import Order

class OrderService:
    def __init__(self, order_repo: OrderRepository, inventory_repo: InventoryRepository):
        self.order_repo = order_repo
        self.inventory_repo = inventory_repo
    
    def create_order(self, customer_id: str, items: list) -> Order:
        # Business rule: customer must exist and be active
        # Business rule: all items must be in stock
        for item in items:
            stock = self.inventory_repo.get_stock(item['sku'])
            if stock < item['quantity']:
                raise ValueError(f"Insufficient stock for {item['sku']}")
        
        order = Order.create(customer_id=customer_id, items=items)
        
        # Business rule: apply bulk discount for large orders
        if order.total > 500:
            order.apply_discount(0.05)
        
        return self.order_repo.save(order)
    
    # Business layer ONLY:
    # - Business rules and validation
    # - Workflow orchestration
    # - Domain operations
    # - Never knows about HTTP, JSON, or SQL
```

```python
# Layer 3: Persistence / Repository — data access
# repositories/order_repository.py
from models.order import Order

class OrderRepository:
    def __init__(self, db_session):
        self.db = db_session
    
    def save(self, order: Order) -> Order:
        self.db.execute(
            "INSERT INTO orders (id, customer_id, total, status) VALUES (%s, %s, %s, %s)",
            (order.id, order.customer_id, order.total, order.status)
        )
        return order
    
    def find_by_id(self, order_id: str) -> Order | None:
        row = self.db.execute(
            "SELECT * FROM orders WHERE id = %s", (order_id,)
        ).fetchone()
        return Order.from_row(row) if row else None
    
    # Persistence layer ONLY:
    # - SQL queries
    # - ORM calls
    # - Mapping between DB rows and domain objects
    # - Never contains business rules
    # - Never knows about HTTP
```

```python
# Layer 4: Database — the actual DB
# (Not code you write — PostgreSQL, MySQL, etc.)
# The repository layer talks to this.
```

---

## Layer responsibilities (the golden rule)

```
Each layer has exactly ONE reason to change:

Presentation: UI framework changes, new endpoint needed, response format changes
Business:     Business rules change, new workflow added
Persistence:  DB schema changes, ORM upgrade, query optimization
Database:     DB engine migration, infrastructure change

When a business rule changes → ONLY the business layer changes
When you add a new API endpoint → ONLY the presentation layer changes
When you optimize a query → ONLY the persistence layer changes
```

---

## The "strict" vs "relaxed" variant

**Strict layering** — each layer only talks to the one directly below:
```
Presentation → Business → Persistence → DB

Presentation cannot skip Business and talk to Persistence directly.
```

**Relaxed layering** — higher layers can skip lower ones when appropriate:
```
Presentation → Business → Persistence → DB
                   ↑
            Presentation can also talk to Persistence directly
            (for simple reads that need no business logic)
```

Relaxed is more common in practice. For a simple "get user by ID" endpoint with no business rules, forcing the call through a service layer adds pointless ceremony.

---

## Common mistakes

### Business logic in the presentation layer

```python
# WRONG: controller contains business rules
@router.post("/orders")
async def create_order(body: CreateOrderRequest):
    # Business rule in the HTTP handler — wrong layer
    if body.total > 10000:
        send_fraud_alert(body.customer_id)
    
    if body.customer_id in BLOCKED_CUSTOMERS:
        raise HTTPException(status_code=403)
    
    order = db.insert_order(body.dict())
    return order
```

```python
# CORRECT: controller delegates to service
@router.post("/orders")
async def create_order(body: CreateOrderRequest, service: OrderService = Depends()):
    order = service.create_order(body.customer_id, body.items)
    return {"order_id": order.id}
```

### Database queries in the business layer

```python
# WRONG: business service running raw SQL
class OrderService:
    def get_high_value_orders(self):
        # SQL directly in the service — wrong layer
        return db.execute("SELECT * FROM orders WHERE total > 1000")
```

```python
# CORRECT: service delegates to repository
class OrderService:
    def get_high_value_orders(self):
        return self.order_repo.find_high_value()

class OrderRepository:
    def find_high_value(self):
        return self.db.execute("SELECT * FROM orders WHERE total > 1000")
```

### Skipping the service layer for writes

```python
# WRONG: controller writes directly to DB (bypasses business rules)
@router.post("/orders")
async def create_order(body: CreateOrderRequest):
    order = Order(**body.dict())
    db.save(order)  # skipped business validation entirely
    return {"order_id": order.id}
```

---

## When layered architecture breaks down

Layered architecture assumes a single system with a single database. It starts to strain under:

- **High read/write asymmetry** → CQRS: separate read and write stacks
- **Complex domain logic across many subdomains** → DDD: bounded contexts replace layers
- **Independent scalability requirements** → Microservices: each service has its own layers
- **Many adapters (HTTP, gRPC, CLI, events)** → Hexagonal: ports and adapters replace the presentation layer

These aren't replacements — they're extensions. Every microservice internally still has layers. Every DDD bounded context internally still has layers.

---

## Evolution path

```
Layered Architecture
        │
        ├── Add: ports/adapters per presentation type
        │         ↓
        │   Hexagonal Architecture (Ports & Adapters)
        │
        ├── Add: dependency inversion between layers
        │         ↓
        │   Clean Architecture (dependencies point inward)
        │
        ├── Add: bounded contexts per subdomain
        │         ↓
        │   Domain-Driven Design
        │
        └── Separate: each bounded context becomes a service
                  ↓
              Microservices
```

---

## Interview talking points

!!! tip "Key things to say"
    1. Layered architecture separates **what** (presentation) from **why** (business) from **how** (persistence)
    2. Dependencies only flow downward — never upward, never skip layers (in strict mode)
    3. The most common violation: business logic leaking into controllers, or SQL leaking into services
    4. Every microservice still has internal layers — microservices and layered architecture are not alternatives
    5. Hexagonal and Clean Architecture solve the "what if we have multiple presentation ports?" problem that N-tier doesn't address

## Related topics

- [Clean Architecture](../software-design/clean-architecture.md) — layered architecture + strict dependency inversion
- [Hexagonal Architecture](hexagonal.md) — layered architecture + multiple adapters
- [Domain-Driven Design](ddd.md) — bounded contexts replace monolithic layers at scale
- [Monolith vs Microservices](monolith-vs-microservices.md) — splitting layers across services
- [SOLID Principles](../software-design/solid.md) — SRP explains why layers exist; DIP explains how they connect
