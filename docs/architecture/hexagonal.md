---
tags:
  - boring-tech
  - for-saas
---

# Hexagonal Architecture

## What it is

Hexagonal Architecture (also called Ports and Adapters) was coined by Alistair Cockburn. The core idea: isolate your business logic from all infrastructure concerns (database, HTTP, message queues, external APIs) by defining explicit ports (interfaces) and adapters (implementations).

## You'll see this when...

- Switching from Postgres to DynamoDB requires touching domain logic — coupling problem
- Want to swap third-party SDK without rewriting business code
- Domain logic has `import psycopg2` or `from django.db.models` mixed in
- Tests need a real database to run — slow, brittle (sign of missing ports/adapters)
- Folders named `ports/`, `adapters/`, `domain/`, `infrastructure/` in the codebase
- Team uses Onion / Clean Architecture (similar idea, different name)
- Heavy use of dependency injection with interfaces for external dependencies
- Anti-corruption layer wraps an external API to keep its model out of yours

```
Traditional Layered (tight coupling):
  HTTP Handler → Service → Repository → PostgreSQL

Hexagonal (decoupled):
  HTTP Adapter → | Application Core | ← PostgreSQL Adapter
  gRPC Adapter → | (Ports)          | ← Redis Adapter
  CLI Adapter →  | (Business Logic) | ← Kafka Adapter
                                      ← External API Adapter
```

The core doesn't know about HTTP, databases, or any specific technology. It only knows about its ports (interfaces).

## Structure

```
┌──────────────────────────────────────────────────┐
│           Application Core                        │
│                                                    │
│  Domain Model (Entities, Value Objects, Events)   │
│  Use Cases / Application Services                  │
│  Port Interfaces (in/out)                          │
└──────────────────────────────────────────────────┘
         ↑↓                        ↑↓
┌──────────────┐         ┌──────────────────────┐
│  Driving     │         │  Driven Adapters      │
│  Adapters    │         │  (Driven by app)      │
│  (Drive app) │         │                      │
│              │         │  - PostgreSQL Repo    │
│  - REST API  │         │  - Redis Cache        │
│  - gRPC      │         │  - Kafka Producer     │
│  - CLI       │         │  - Stripe Client      │
│  - Queue     │         │  - Email Service      │
│    Consumer  │         │                      │
└──────────────┘         └──────────────────────┘
```

**Driving (primary) adapters:** Initiate actions. REST API, gRPC server, CLI, queue consumers.

**Driven (secondary) adapters:** Called by the application. Database repositories, caches, external APIs, message publishers.

## Ports

Ports are interfaces defined in the application core — the boundaries between core and adapters.

```python
# Driving port: use case interface (called by driving adapters)
class OrderUseCase(ABC):
    @abstractmethod
    def place_order(self, cmd: PlaceOrderCommand) -> OrderResult:
        pass
    
    @abstractmethod
    def cancel_order(self, order_id: str) -> None:
        pass

# Driven port: repository interface (called by application, implemented by adapters)
class OrderRepository(ABC):
    @abstractmethod
    def find_by_id(self, order_id: str) -> Optional[Order]:
        pass
    
    @abstractmethod
    def save(self, order: Order) -> None:
        pass

class PaymentGateway(ABC):
    @abstractmethod
    def charge(self, amount: Decimal, payment_method: str) -> PaymentResult:
        pass

class EventPublisher(ABC):
    @abstractmethod
    def publish(self, event: DomainEvent) -> None:
        pass
```

## Application Core

Business logic with no infrastructure dependencies:

```python
class OrderService(OrderUseCase):
    def __init__(
        self,
        order_repo: OrderRepository,       # driven port
        payment_gateway: PaymentGateway,   # driven port
        event_publisher: EventPublisher    # driven port
    ):
        self.order_repo = order_repo
        self.payment_gateway = payment_gateway
        self.event_publisher = event_publisher
    
    def place_order(self, cmd: PlaceOrderCommand) -> OrderResult:
        # Pure business logic — no HTTP, no SQL, no Kafka
        
        order = Order.create(
            customer_id=cmd.customer_id,
            items=cmd.items
        )
        
        if order.total > Decimal('10000'):
            # Business rule: orders over $10k need approval
            order.flag_for_approval()
        else:
            payment = self.payment_gateway.charge(order.total, cmd.payment_method)
            order.confirm(payment.transaction_id)
        
        self.order_repo.save(order)
        self.event_publisher.publish(OrderPlaced(order_id=order.id))
        
        return OrderResult(order_id=order.id, status=order.status)
```

## Adapters

Adapters implement the ports using specific technologies:

```python
# Driving adapter: HTTP API
class OrderHTTPController:
    def __init__(self, use_case: OrderUseCase):
        self.use_case = use_case
    
    def post_order(self, request: HTTPRequest) -> HTTPResponse:
        # Parse HTTP request → command
        cmd = PlaceOrderCommand(
            customer_id=request.json['customer_id'],
            items=[OrderItem(**item) for item in request.json['items']],
            payment_method=request.json['payment_method']
        )
        
        result = self.use_case.place_order(cmd)
        
        # Command result → HTTP response
        return HTTPResponse(status=201, body={'order_id': result.order_id})

# Driven adapter: PostgreSQL repository
class PostgresOrderRepository(OrderRepository):
    def find_by_id(self, order_id: str) -> Optional[Order]:
        row = self.db.query("SELECT * FROM orders WHERE id = %s", [order_id])
        if not row:
            return None
        return self._map_to_domain(row)  # DB model → domain model
    
    def save(self, order: Order) -> None:
        self.db.execute(
            "INSERT INTO orders ... ON CONFLICT ... DO UPDATE ...",
            self._map_to_db(order)  # domain model → DB model
        )

# Driven adapter: Stripe payment gateway
class StripePaymentGateway(PaymentGateway):
    def charge(self, amount: Decimal, payment_method: str) -> PaymentResult:
        charge = stripe.Charge.create(
            amount=int(amount * 100),  # cents
            currency="usd",
            source=payment_method
        )
        return PaymentResult(transaction_id=charge.id)

# For testing: in-memory adapter
class InMemoryOrderRepository(OrderRepository):
    def __init__(self):
        self.storage = {}
    
    def find_by_id(self, order_id: str) -> Optional[Order]:
        return self.storage.get(order_id)
    
    def save(self, order: Order) -> None:
        self.storage[order.id] = order
```

## Testing benefits

The key benefit: you can test the entire business logic without a database, HTTP server, or any infrastructure:

```python
def test_place_order_over_limit_flagged_for_approval():
    # Use in-memory adapters — no DB, no Stripe, no HTTP
    repo = InMemoryOrderRepository()
    payment = MockPaymentGateway()
    publisher = InMemoryEventPublisher()
    
    service = OrderService(repo, payment, publisher)
    
    result = service.place_order(PlaceOrderCommand(
        customer_id="cust_1",
        items=[OrderItem("product_1", 5, Decimal("2500"))],  # $12,500 total
        payment_method="pm_test"
    ))
    
    order = repo.find_by_id(result.order_id)
    assert order.status == "pending_approval"
    assert not payment.was_charged()  # payment not charged for pending approval
```

No Docker, no DB setup, no network. Pure business logic tests run in milliseconds.

## Dependency injection

The core depends on interfaces, not implementations. Inject implementations at startup:

```python
# Composition root (entry point)
def create_app():
    # Infrastructure
    db = create_postgres_connection()
    redis = create_redis_connection()
    stripe_client = stripe.StripeClient(api_key=os.environ['STRIPE_KEY'])
    kafka = create_kafka_producer()
    
    # Driven adapters
    order_repo = PostgresOrderRepository(db)
    payment_gw = StripePaymentGateway(stripe_client)
    event_pub = KafkaEventPublisher(kafka)
    
    # Application core (injected with adapters)
    order_service = OrderService(order_repo, payment_gw, event_pub)
    
    # Driving adapters
    http_controller = OrderHTTPController(order_service)
    
    return create_flask_app(http_controller)
```

## When to use hexagonal architecture

**Good fit:**
- Complex business logic that needs thorough testing
- Multiple delivery mechanisms (HTTP API + CLI + queue consumer)
- Multiple storage backends (swap MySQL for Postgres, or add cache layer)
- Domain-driven design (natural complement)
- Long-lived systems that will evolve

**Overkill:**
- Simple CRUD endpoints (thin layer on top of DB)
- Short-lived or throwaway code
- Very small codebase (the interface overhead isn't worth it)

## Interview angle

!!! tip "When hexagonal comes up"
    Usually in "how would you structure the code?" or "how do you ensure testability?" questions.

**Key points:**
1. Core business logic has zero infrastructure dependencies — fully testable in isolation
2. Ports define the contracts; adapters provide the implementations
3. Swap adapters without changing business logic (Postgres → DynamoDB, Stripe → Braintree)
4. Natural fit with DDD and TDD

## Related topics

- [Domain-Driven Design](ddd.md) — hexagonal is the code structure; DDD is the domain model
- [Twelve-Factor App](twelve-factor.md) — complementary principles for cloud-native apps
- [Monolith vs Microservices](monolith-vs-microservices.md) — hexagonal applies to both
