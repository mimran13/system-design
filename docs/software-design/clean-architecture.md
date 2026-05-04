# Clean Architecture

Clean Architecture (Robert C. Martin, 2012) is a set of principles for organizing code so that the core business logic is independent of frameworks, databases, UIs, and external services. It formalizes DIP at the architectural level.

---

## The core idea: The Dependency Rule

```
Source code dependencies must point only inward — toward higher-level policy.
Nothing in an inner layer can know about anything in an outer layer.
```

```
              ┌─────────────────────────────┐
              │     Frameworks & Drivers    │  (outermost)
              │  ┌────────────────────────┐ │
              │  │   Interface Adapters   │ │
              │  │  ┌──────────────────┐  │ │
              │  │  │   Application    │  │ │
              │  │  │   Use Cases      │  │ │
              │  │  │  ┌────────────┐  │  │ │
              │  │  │  │  Entities  │  │  │ │  (innermost)
              │  │  │  └────────────┘  │  │ │
              │  │  └──────────────────┘  │ │
              │  └────────────────────────┘ │
              └─────────────────────────────┘

Dependencies flow:  Outer → Inner
                    NEVER: Inner → Outer
```

---

## The four layers

### Layer 1: Entities (Enterprise Business Rules)

The core domain model. Business objects with the most fundamental rules. No dependencies on anything external.

```python
# entities/order.py
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional

class OrderStatus(Enum):
    PENDING = 'pending'
    PAID = 'paid'
    SHIPPED = 'shipped'
    DELIVERED = 'delivered'
    CANCELLED = 'cancelled'

@dataclass
class OrderItem:
    sku: str
    quantity: int
    unit_price: float
    
    def subtotal(self) -> float:
        return self.quantity * self.unit_price

@dataclass
class Order:
    id: str
    customer_id: str
    items: list[OrderItem]
    status: OrderStatus = OrderStatus.PENDING
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def total(self) -> float:
        return sum(item.subtotal() for item in self.items)
    
    def can_be_cancelled(self) -> bool:
        return self.status in (OrderStatus.PENDING, OrderStatus.PAID)
    
    def cancel(self):
        if not self.can_be_cancelled():
            raise InvalidOperationError(
                f"Cannot cancel order in status {self.status.value}"
            )
        self.status = OrderStatus.CANCELLED

# Entity contains ONLY business rules — no DB, no HTTP, no frameworks
```

### Layer 2: Use Cases (Application Business Rules)

Application-specific business logic. Orchestrates entities to fulfill specific user goals. Depends on entities. Defines interfaces (ports) for external dependencies.

```python
# use_cases/place_order.py
from dataclasses import dataclass
from abc import ABC, abstractmethod
from entities.order import Order, OrderItem

# Input/Output data structures (DTOs) — no domain objects leaked to outer layers
@dataclass
class PlaceOrderRequest:
    customer_id: str
    items: list[dict]   # [{'sku': str, 'quantity': int}]

@dataclass
class PlaceOrderResponse:
    order_id: str
    total: float
    status: str

# Ports (interfaces) — use case defines what it needs; outer layers implement
class OrderRepository(ABC):
    @abstractmethod
    def save(self, order: Order) -> Order: ...
    
    @abstractmethod
    def find_by_id(self, order_id: str) -> Optional[Order]: ...

class ProductCatalog(ABC):
    @abstractmethod
    def get_price(self, sku: str) -> float: ...

class PaymentGateway(ABC):
    @abstractmethod
    def reserve_payment(self, customer_id: str, amount: float) -> str: ...

class EventPublisher(ABC):
    @abstractmethod
    def publish(self, event_type: str, payload: dict): ...

# Use case: orchestrates entities + ports
class PlaceOrderUseCase:
    def __init__(
        self,
        order_repo: OrderRepository,
        catalog: ProductCatalog,
        payment: PaymentGateway,
        events: EventPublisher,
    ):
        self._order_repo = order_repo
        self._catalog = catalog
        self._payment = payment
        self._events = events
    
    def execute(self, request: PlaceOrderRequest) -> PlaceOrderResponse:
        # Build order items with current prices
        items = []
        for item_req in request.items:
            price = self._catalog.get_price(item_req['sku'])
            items.append(OrderItem(
                sku=item_req['sku'],
                quantity=item_req['quantity'],
                unit_price=price,
            ))
        
        # Create entity
        order = Order(
            id=generate_id(),
            customer_id=request.customer_id,
            items=items,
        )
        
        # Reserve payment
        self._payment.reserve_payment(request.customer_id, order.total())
        
        # Persist
        saved_order = self._order_repo.save(order)
        
        # Notify
        self._events.publish('order.placed', {
            'order_id': saved_order.id,
            'customer_id': saved_order.customer_id,
            'total': saved_order.total(),
        })
        
        return PlaceOrderResponse(
            order_id=saved_order.id,
            total=saved_order.total(),
            status=saved_order.status.value,
        )
```

### Layer 3: Interface Adapters

Converts data between the format most convenient for use cases/entities and the format most convenient for external systems (HTTP, DB, queues). Controllers, presenters, gateways, repositories.

```python
# adapters/http/order_controller.py — HTTP adapter
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from use_cases.place_order import PlaceOrderUseCase, PlaceOrderRequest

class PlaceOrderHTTPRequest(BaseModel):
    customer_id: str
    items: list[dict]

router = APIRouter()

@router.post("/orders")
async def place_order(
    body: PlaceOrderHTTPRequest,
    use_case: PlaceOrderUseCase = Depends(get_place_order_use_case),
):
    try:
        response = use_case.execute(PlaceOrderRequest(
            customer_id=body.customer_id,
            items=body.items,
        ))
        return {'order_id': response.order_id, 'total': response.total}
    except InvalidOperationError as e:
        raise HTTPException(status_code=422, detail=str(e))


# adapters/persistence/postgres_order_repository.py — DB adapter
from use_cases.place_order import OrderRepository
from entities.order import Order, OrderItem, OrderStatus

class PostgresOrderRepository(OrderRepository):
    def __init__(self, db_session):
        self._db = db_session
    
    def save(self, order: Order) -> Order:
        # Map entity → DB row
        row = {
            'id': order.id,
            'customer_id': order.customer_id,
            'status': order.status.value,
            'created_at': order.created_at,
        }
        self._db.execute(
            "INSERT INTO orders VALUES (:id, :customer_id, :status, :created_at)",
            row
        )
        for item in order.items:
            self._db.execute(
                "INSERT INTO order_items VALUES (:order_id, :sku, :qty, :price)",
                {'order_id': order.id, 'sku': item.sku,
                 'qty': item.quantity, 'price': item.unit_price}
            )
        return order
    
    def find_by_id(self, order_id: str) -> Optional[Order]:
        row = self._db.execute(
            "SELECT * FROM orders WHERE id = :id", {'id': order_id}
        ).fetchone()
        if not row:
            return None
        
        items_rows = self._db.execute(
            "SELECT * FROM order_items WHERE order_id = :id", {'id': order_id}
        ).fetchall()
        
        # Map DB rows → entity
        return Order(
            id=row['id'],
            customer_id=row['customer_id'],
            status=OrderStatus(row['status']),
            items=[OrderItem(r['sku'], r['quantity'], r['unit_price']) for r in items_rows],
        )


# adapters/messaging/sns_event_publisher.py — messaging adapter
import boto3, json
from use_cases.place_order import EventPublisher

class SNSEventPublisher(EventPublisher):
    def __init__(self, topic_arn: str):
        self._sns = boto3.client('sns')
        self._topic = topic_arn
    
    def publish(self, event_type: str, payload: dict):
        self._sns.publish(
            TopicArn=self._topic,
            Message=json.dumps(payload),
            MessageAttributes={
                'event_type': {'DataType': 'String', 'StringValue': event_type}
            }
        )
```

### Layer 4: Frameworks & Drivers

The outermost layer. FastAPI, SQLAlchemy, boto3, Redis clients. You don't write much code here — you configure and glue.

```python
# infrastructure/composition_root.py — the ONLY place that knows about all layers
from fastapi import FastAPI
from use_cases.place_order import PlaceOrderUseCase
from adapters.persistence.postgres_order_repository import PostgresOrderRepository
from adapters.persistence.postgres_product_catalog import PostgresProductCatalog
from adapters.payments.stripe_gateway import StripePaymentGateway
from adapters.messaging.sns_event_publisher import SNSEventPublisher
from adapters.http.order_controller import router as order_router

def create_app() -> FastAPI:
    db_session = create_db_session(settings.DATABASE_URL)
    
    # Wire the dependency graph
    order_repo = PostgresOrderRepository(db_session)
    catalog = PostgresProductCatalog(db_session)
    payment = StripePaymentGateway(settings.STRIPE_KEY)
    events = SNSEventPublisher(settings.SNS_TOPIC_ARN)
    
    place_order = PlaceOrderUseCase(order_repo, catalog, payment, events)
    
    app = FastAPI()
    app.include_router(order_router)
    
    # Inject use case into FastAPI's DI
    app.dependency_overrides[get_place_order_use_case] = lambda: place_order
    
    return app
```

---

## Project structure

```
src/
├── entities/                   # Layer 1: pure domain objects
│   ├── order.py
│   ├── customer.py
│   └── product.py
│
├── use_cases/                  # Layer 2: application logic + port interfaces
│   ├── place_order.py          # includes OrderRepository, PaymentGateway ABCs
│   ├── cancel_order.py
│   └── get_order.py
│
├── adapters/                   # Layer 3: interface adapters
│   ├── http/
│   │   ├── order_controller.py
│   │   └── user_controller.py
│   ├── persistence/
│   │   ├── postgres_order_repository.py   # implements use_cases.OrderRepository
│   │   └── postgres_product_catalog.py
│   ├── payments/
│   │   └── stripe_gateway.py              # implements use_cases.PaymentGateway
│   └── messaging/
│       └── sns_event_publisher.py
│
└── infrastructure/             # Layer 4: frameworks, config, composition root
    ├── composition_root.py
    ├── settings.py
    └── database.py
```

**Import direction rules:**
```
entities/     → imports nothing internal
use_cases/    → imports from entities/ only
adapters/     → imports from use_cases/ and entities/
infrastructure/ → imports from all layers (it's the composition root)
```

---

## Testability: the main benefit

Because use cases depend only on abstract interfaces, they can be tested with no infrastructure:

```python
# test_place_order.py — zero DB, zero HTTP, zero Stripe
class FakeOrderRepository:
    def __init__(self): self.saved: list[Order] = []
    def save(self, order): self.saved.append(order); return order
    def find_by_id(self, id): return next((o for o in self.saved if o.id == id), None)

class FakeProductCatalog:
    def get_price(self, sku): return {'SKU001': 29.99, 'SKU002': 49.99}.get(sku, 0.0)

class FakePaymentGateway:
    def __init__(self): self.charges = []
    def reserve_payment(self, customer_id, amount): self.charges.append(amount)

class FakeEventPublisher:
    def __init__(self): self.events = []
    def publish(self, event_type, payload): self.events.append((event_type, payload))

def test_place_order_creates_order_and_publishes_event():
    repo = FakeOrderRepository()
    events = FakeEventPublisher()
    use_case = PlaceOrderUseCase(repo, FakeProductCatalog(), FakePaymentGateway(), events)
    
    response = use_case.execute(PlaceOrderRequest(
        customer_id='cust_123',
        items=[{'sku': 'SKU001', 'quantity': 2}],
    ))
    
    assert response.total == 59.98
    assert len(repo.saved) == 1
    assert len(events.events) == 1
    assert events.events[0][0] == 'order.placed'

def test_place_order_calculates_correct_total():
    use_case = PlaceOrderUseCase(
        FakeOrderRepository(), FakeProductCatalog(),
        FakePaymentGateway(), FakeEventPublisher()
    )
    response = use_case.execute(PlaceOrderRequest(
        customer_id='cust_1',
        items=[{'sku': 'SKU001', 'quantity': 1}, {'sku': 'SKU002', 'quantity': 2}],
    ))
    assert response.total == 29.99 + 49.99 * 2  # 129.97
```

---

## Layered Architecture vs Clean Architecture

```
Traditional N-tier:
  Presentation → Business Logic → Data Access → Database
  Problem: Business Logic can leak DB concerns; hard to test

Clean Architecture:
  Entities (pure) ← Use Cases (pure) ← Adapters ← Infrastructure
  Dependency rule: always inward
  Result: core logic has zero infrastructure knowledge
```

**The key difference:** In N-tier, the database is the foundation everything depends on. In Clean Architecture, the business logic is the foundation — the database is a detail that adapts to it.

---

## When to use Clean Architecture

**Good fit:**
- Complex domain logic that needs to be tested independently
- Multiple delivery mechanisms (HTTP API + gRPC + CLI + events)
- Long-lived systems that will evolve over years
- Teams where domain experts and developers need clear boundaries

**Overkill for:**
- Simple CRUD APIs with little business logic
- Short-lived projects or proofs of concept
- Microservices that are essentially "thin adapters" around a data store

**Simplified version (Hexagonal / Ports & Adapters):** Same idea, less ceremony. Use cases define ports (interfaces); adapters implement them. No strict layer count. See also [Hexagonal Architecture](../architecture/hexagonal.md).

---

## Interview talking points

!!! tip "Key things to say"
    1. The dependency rule is everything: inner layers never know about outer layers
    2. Use cases own the port interfaces — they define what they need; adapters provide it
    3. This makes use cases 100% unit-testable — no DB, no HTTP, no network
    4. DTOs (request/response objects) cross layer boundaries — entities don't leak out
    5. The composition root is the only place that touches concrete classes — single place to swap implementations

## Related topics

- [SOLID Principles](solid.md) — DIP is the rule Clean Architecture is built on
- [IoC & Dependency Injection](ioc-di.md) — how the layers are wired together
- [Hexagonal Architecture](../architecture/hexagonal.md) — simpler version of the same idea
- [Domain-Driven Design](../architecture/ddd.md) — entities and bounded contexts complement Clean Architecture
