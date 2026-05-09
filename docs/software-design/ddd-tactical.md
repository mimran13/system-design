# DDD Tactical Patterns

Domain-Driven Design (DDD) has two levels. **Strategic** patterns (Bounded Contexts, Context Maps, Ubiquitous Language) define how you divide a large system — covered in [Software Architecture: DDD](../architecture/ddd.md). **Tactical** patterns are the code-level building blocks you use inside a single Bounded Context to model the domain faithfully.

---

## The building blocks

```
Domain Model
  ├── Entities          ← objects with identity that persists over time
  ├── Value Objects     ← immutable objects defined by their attributes
  ├── Aggregates        ← clusters of entities/VOs with a consistency boundary
  ├── Domain Events     ← something that happened in the domain
  ├── Domain Services   ← stateless operations that don't belong on an entity
  ├── Repositories      ← abstraction for retrieving/saving aggregates
  └── Factories         ← complex construction logic
```

---

## Entities

An **Entity** has a unique identity that persists over time. Two entities with the same attributes are still different objects if their IDs differ.

```python
@dataclass
class User:
    id: UserId           # identity — this is what makes it an Entity
    email: Email
    name: str
    created_at: datetime

    def change_email(self, new_email: Email) -> None:
        if new_email == self.email:
            return
        self.email = new_email
        self._record_event(EmailChanged(user_id=self.id, new_email=new_email))

    def __eq__(self, other):
        return isinstance(other, User) and self.id == other.id

    def __hash__(self):
        return hash(self.id)
```

**Key traits:**
- Identity defined by ID, not attributes
- Mutable — state changes over its lifetime
- Equality based on ID
- Contains business logic relevant to itself

---

## Value Objects

A **Value Object** is defined entirely by its attributes. No identity — two VOs with identical attributes are interchangeable. Must be immutable.

```python
@dataclass(frozen=True)   # frozen = immutable
class Money:
    amount: Decimal
    currency: str

    def __post_init__(self):
        if self.amount < 0:
            raise ValueError("Money cannot be negative")
        if len(self.currency) != 3:
            raise ValueError("Currency must be a 3-letter ISO code")

    def add(self, other: "Money") -> "Money":
        if self.currency != other.currency:
            raise ValueError("Cannot add different currencies")
        return Money(self.amount + other.amount, self.currency)

    def multiply(self, factor: Decimal) -> "Money":
        return Money(self.amount * factor, self.currency)


@dataclass(frozen=True)
class Address:
    street: str
    city: str
    country: str
    postal_code: str


@dataclass(frozen=True)
class Email:
    value: str

    def __post_init__(self):
        if "@" not in self.value:
            raise ValueError(f"Invalid email: {self.value}")
```

**Key traits:**
- No identity field
- Immutable — never mutate, create a new one instead
- Equality based on all attributes
- Self-validating — invalid VOs can't be constructed
- Behavior is safe to put here (e.g., `Money.add`)

**Rule of thumb:** If you're using a primitive (string, int, float) to represent a domain concept, make it a Value Object. Email, Money, Address, PhoneNumber, Quantity, Color.

---

## Aggregates

An **Aggregate** is a cluster of entities and value objects with a single root entity. It defines a consistency boundary — all changes within the aggregate happen together or not at all.

```
Order (Aggregate Root)
  ├── id: OrderId
  ├── status: OrderStatus
  ├── customer_id: CustomerId    ← reference by ID, not object
  ├── items: list[OrderItem]     ← child entities, owned by Order
  └── total: Money               ← value object
```

```python
class Order:  # Aggregate Root
    def __init__(self, order_id: OrderId, customer_id: CustomerId):
        self.id = order_id
        self.customer_id = customer_id
        self.status = OrderStatus.DRAFT
        self._items: list[OrderItem] = []
        self._events: list[DomainEvent] = []

    def add_item(self, product_id: ProductId, quantity: int, price: Money) -> None:
        if self.status != OrderStatus.DRAFT:
            raise DomainError("Cannot add items to a non-draft order")
        item = OrderItem(product_id=product_id, quantity=quantity, unit_price=price)
        self._items.append(item)

    def confirm(self) -> None:
        if not self._items:
            raise DomainError("Cannot confirm an empty order")
        if self.status != OrderStatus.DRAFT:
            raise DomainError(f"Cannot confirm order in status {self.status}")
        self.status = OrderStatus.CONFIRMED
        self._events.append(OrderConfirmed(order_id=self.id, total=self.total))

    @property
    def total(self) -> Money:
        return sum((item.subtotal for item in self._items), Money(Decimal(0), "USD"))

    def pull_events(self) -> list[DomainEvent]:
        events = list(self._events)
        self._events.clear()
        return events
```

### Aggregate rules

1. **One repository per aggregate** — load and save the whole aggregate, not individual child entities
2. **Reference other aggregates by ID only** — `Order` holds `customer_id: CustomerId`, not `customer: Customer`
3. **Keep aggregates small** — large aggregates cause contention. If two things don't need to be consistent together, they're probably separate aggregates
4. **Enforce invariants inside** — all business rules that span multiple fields/items live in the aggregate root

```python
# WRONG: reaching inside another aggregate
order.customer.update_address(new_address)  # Order now depends on Customer internals

# CORRECT: only reference by ID
# To update address: go through Customer repository directly
customer = customer_repo.get(order.customer_id)
customer.update_address(new_address)
customer_repo.save(customer)
```

---

## Domain Events

A **Domain Event** represents something that happened in the domain — past tense, immutable fact.

```python
@dataclass(frozen=True)
class OrderConfirmed:
    order_id: OrderId
    customer_id: CustomerId
    total: Money
    occurred_at: datetime = field(default_factory=datetime.utcnow)

@dataclass(frozen=True)
class PaymentProcessed:
    order_id: OrderId
    amount: Money
    payment_method: str
    occurred_at: datetime = field(default_factory=datetime.utcnow)

@dataclass(frozen=True)
class ItemShipped:
    order_id: OrderId
    tracking_number: str
    occurred_at: datetime = field(default_factory=datetime.utcnow)
```

**Uses:**
- Trigger side effects in other bounded contexts (send email on `OrderConfirmed`)
- Event sourcing — rebuild state from event history
- Audit trail — permanent record of what happened and when
- Decoupling — the Order BC doesn't need to know about the Notification BC

**Publishing pattern:**

```python
class OrderService:
    def confirm_order(self, order_id: OrderId) -> None:
        order = self.order_repo.get(order_id)
        order.confirm()                          # raises event internally
        self.order_repo.save(order)
        events = order.pull_events()
        for event in events:
            self.event_bus.publish(event)        # notify other BCs
```

---

## Domain Services

A **Domain Service** encapsulates domain logic that doesn't naturally belong to an entity or value object — typically operations involving multiple aggregates.

```python
# NOT a good fit for Entity: involves two aggregates (Account × Account)
class MoneyTransferService:
    def transfer(
        self,
        from_account: Account,
        to_account: Account,
        amount: Money
    ) -> None:
        from_account.debit(amount)
        to_account.credit(amount)
        # Both aggregates are modified atomically

# NOT a good fit for Entity: requires external data (exchange rates)
class CurrencyConversionService:
    def convert(self, amount: Money, target_currency: str) -> Money:
        rate = self.exchange_rate_provider.get_rate(amount.currency, target_currency)
        return Money(amount.amount * rate, target_currency)
```

**Distinguish from Application Services:**
- **Domain Service** — contains domain logic, speaks ubiquitous language
- **Application Service** — orchestrates use cases, handles transactions, no domain logic

---

## Repositories

A **Repository** provides a collection-like interface for retrieving and persisting aggregates. It hides all persistence details from the domain.

```python
# Repository interface (in the domain layer)
from abc import ABC, abstractmethod

class OrderRepository(ABC):
    @abstractmethod
    def get(self, order_id: OrderId) -> Order:
        ...

    @abstractmethod
    def save(self, order: Order) -> None:
        ...

    @abstractmethod
    def find_by_customer(self, customer_id: CustomerId) -> list[Order]:
        ...


# Implementation (in the infrastructure layer)
class PostgresOrderRepository(OrderRepository):
    def get(self, order_id: OrderId) -> Order:
        row = self.db.query("SELECT * FROM orders WHERE id = %s", order_id.value)
        items = self.db.query("SELECT * FROM order_items WHERE order_id = %s", order_id.value)
        return self._to_domain(row, items)

    def save(self, order: Order) -> None:
        # Upsert the aggregate root and its children in one transaction
        self.db.upsert("orders", self._to_row(order))
        self.db.delete("order_items", order_id=order.id.value)
        for item in order.items:
            self.db.insert("order_items", self._item_to_row(item))
```

**Key traits:**
- One repository per aggregate
- Interface in domain layer, implementation in infrastructure layer
- Domain never imports ORM/SQL — only talks to the interface
- The repository owns the mapping between domain objects and persistence schema

---

## Putting it together: a use case

```python
class ConfirmOrderUseCase:  # Application Service
    def __init__(
        self,
        order_repo: OrderRepository,
        payment_service: PaymentService,   # domain service
        event_bus: EventBus
    ):
        self.order_repo = order_repo
        self.payment_service = payment_service
        self.event_bus = event_bus

    def execute(self, order_id: OrderId, payment_method: PaymentMethod) -> None:
        # 1. Load aggregate
        order = self.order_repo.get(order_id)

        # 2. Execute domain logic (domain service spans two aggregates)
        self.payment_service.charge(order.total, payment_method)

        # 3. Mutate aggregate
        order.confirm()

        # 4. Persist
        self.order_repo.save(order)

        # 5. Publish events
        for event in order.pull_events():
            self.event_bus.publish(event)
```

---

## When to use DDD tactical patterns

DDD tactical patterns add structure — they're not always worth it.

| Scenario | Recommendation |
|---|---|
| Simple CRUD app | Overkill — use plain structs + service layer |
| Complex domain with many business rules | Use DDD — the structure pays off |
| Multiple teams, shared model | Strategic DDD (Bounded Contexts) essential |
| High read throughput | CQRS + simplified read models alongside rich domain model |

---

## Interview angle

!!! tip "DDD tactical in system design"
    - *"How would you model an e-commerce order?"* → Order as Aggregate Root with OrderItems as child entities. Money as Value Object (immutable, validated). OrderConfirmed as Domain Event. OrderRepository hides SQL from the domain.
    - *"Why do you reference other aggregates by ID instead of object reference?"* → Keeps aggregate boundaries clean. Loading Order doesn't force loading Customer. Each aggregate is its own transactional boundary.
    - *"What's the difference between an Entity and a Value Object?"* → Identity vs attributes. User has an ID — two users with same name are different. Address has no ID — two identical addresses are interchangeable.

## Related topics

- [Software Architecture: DDD](../architecture/ddd.md) — strategic patterns, Bounded Contexts
- [Clean Architecture](clean-architecture.md) — how DDD layers map to clean architecture rings
- [IoC & Dependency Injection](ioc-di.md) — how repositories are injected into application services
- [Patterns: CQRS](../patterns/cqrs.md) — separating write model (DDD aggregates) from read model
- [Patterns: Event Sourcing](../patterns/event-sourcing.md) — persisting domain events as the source of truth
