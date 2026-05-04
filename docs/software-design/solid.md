# SOLID Principles

Five principles for writing object-oriented code that's easy to understand, extend, and maintain. Coined by Robert C. Martin (Uncle Bob). Every major design pattern is ultimately an application of one or more of these principles.

---

## S — Single Responsibility Principle (SRP)

> A class should have only one reason to change.

"Reason to change" means a business actor or stakeholder whose requirements could cause a change. If two different actors can independently drive changes to a class, split it.

```python
# VIOLATION: UserService has three actors — Auth team, Billing team, Reporting team
class UserService:
    def authenticate(self, email, password): ...       # Auth team cares about this
    def charge_subscription(self, user_id): ...        # Billing team cares about this
    def generate_activity_report(self, user_id): ...   # Reporting team cares about this
    
    # When auth requirements change, billing and reporting code is in the blast radius.
    # When reporting changes, auth and billing are at risk.


# CORRECT: one class per actor
class AuthService:
    def authenticate(self, email: str, password: str) -> AuthToken: ...
    def validate_token(self, token: str) -> User: ...

class BillingService:
    def charge_subscription(self, user_id: str) -> Receipt: ...
    def cancel_subscription(self, user_id: str): ...

class UserReportingService:
    def generate_activity_report(self, user_id: str, period: DateRange) -> Report: ...
```

**SRP at function level:**

```python
# VIOLATION: one function does parsing + validation + saving
def process_user_registration(raw_data: dict):
    # Parsing
    email = raw_data.get('email', '').strip().lower()
    name = raw_data.get('name', '').strip()
    
    # Validation
    if not email or '@' not in email:
        raise ValueError("Invalid email")
    if len(name) < 2:
        raise ValueError("Name too short")
    
    # Persistence
    user = User(email=email, name=name)
    db.save(user)
    
    # Side effect: sending email
    mailer.send_welcome_email(user)


# CORRECT: each step is its own function
def process_user_registration(raw_data: dict) -> User:
    request = parse_registration(raw_data)
    validate_registration(request)
    user = create_user(request)
    event_bus.publish(UserRegistered(user_id=user.id))
    return user
```

**Common misconception:** SRP does NOT mean "every class does exactly one thing." It means one reason to change. A `UserRepository` that handles all user-related DB operations is fine — it has one actor (the persistence team).

---

## O — Open/Closed Principle (OCP)

> Software entities should be open for extension, closed for modification.

New behavior should be addable without modifying existing code. Achieve this through abstractions (interfaces, abstract classes) that concrete implementations extend.

```python
# VIOLATION: adding a new payment method requires modifying existing code
class PaymentProcessor:
    def process(self, payment_method: str, amount: float):
        if payment_method == 'credit_card':
            self._charge_card(amount)
        elif payment_method == 'paypal':
            self._charge_paypal(amount)
        elif payment_method == 'crypto':        # ← modifying existing class
            self._charge_crypto(amount)
        # Every new method = modify this class = risk of breaking existing paths


# CORRECT: new payment methods extend, don't modify
from abc import ABC, abstractmethod

class PaymentGateway(ABC):
    @abstractmethod
    def process(self, amount: float) -> Receipt: ...

class CreditCardGateway(PaymentGateway):
    def process(self, amount: float) -> Receipt:
        # credit card specific logic

class PayPalGateway(PaymentGateway):
    def process(self, amount: float) -> Receipt:
        # paypal specific logic

class CryptoGateway(PaymentGateway):      # ← new gateway: extend, don't touch existing
    def process(self, amount: float) -> Receipt:
        # crypto specific logic

class PaymentProcessor:
    def __init__(self, gateway: PaymentGateway):
        self.gateway = gateway
    
    def process(self, amount: float) -> Receipt:
        return self.gateway.process(amount)   # ← never needs to change
```

**OCP with strategy + factory:**

```python
# Factory decides which implementation — only factory changes for new types
class GatewayFactory:
    _registry: dict[str, type[PaymentGateway]] = {
        'credit_card': CreditCardGateway,
        'paypal': PayPalGateway,
        'crypto': CryptoGateway,
    }
    
    @classmethod
    def create(cls, method: str) -> PaymentGateway:
        if method not in cls._registry:
            raise ValueError(f"Unknown payment method: {method}")
        return cls._registry[method]()
    
    @classmethod
    def register(cls, method: str, gateway_class: type[PaymentGateway]):
        cls._registry[method] = gateway_class
```

---

## L — Liskov Substitution Principle (LSP)

> Subtypes must be substitutable for their base types without altering program correctness.

If code works with a `Bird`, it must work with any `Bird` subclass. A subclass that throws when a base method is called, or silently does nothing, violates LSP.

```python
# VIOLATION: Square "is a" Rectangle but breaks Rectangle's contract
class Rectangle:
    def __init__(self, width: float, height: float):
        self._width = width
        self._height = height
    
    def set_width(self, width: float): self._width = width
    def set_height(self, height: float): self._height = height
    def area(self) -> float: return self._width * self._height

class Square(Rectangle):
    def set_width(self, width: float):
        self._width = width
        self._height = width    # Square forces both to be equal — breaks callers!
    
    def set_height(self, height: float):
        self._height = height
        self._width = height


# This code works for Rectangle but breaks silently for Square:
def stretch_width(rect: Rectangle):
    rect.set_height(10)
    rect.set_width(20)
    assert rect.area() == 200  # passes for Rectangle, FAILS for Square
```

**LSP with exceptions:**

```python
# VIOLATION: subclass restricts what base class allows
class ReadWriteRepository:
    def find(self, id: str): ...
    def save(self, entity): ...
    def delete(self, id: str): ...

class ReadOnlyRepository(ReadWriteRepository):
    def save(self, entity):
        raise NotImplementedError("Read-only!")   # violates LSP
    
    def delete(self, id: str):
        raise NotImplementedError("Read-only!")   # caller expects these to work


# CORRECT: model the hierarchy so subtypes don't restrict base behavior
class Repository(ABC):
    @abstractmethod
    def find(self, id: str): ...

class MutableRepository(Repository, ABC):
    @abstractmethod
    def save(self, entity): ...
    
    @abstractmethod
    def delete(self, id: str): ...

class ReadOnlyUserRepository(Repository):
    def find(self, id: str): ...  # fine — doesn't pretend to be mutable

class UserRepository(MutableRepository):
    def find(self, id: str): ...
    def save(self, entity): ...
    def delete(self, id: str): ...
```

**LSP checklist for subclasses:**
- Preconditions: subclass must accept at least what the parent accepts (don't strengthen)
- Postconditions: subclass must return at least what the parent promises (don't weaken)
- Exceptions: subclass must not raise exceptions the parent doesn't declare

---

## I — Interface Segregation Principle (ISP)

> Clients should not be forced to depend on interfaces they don't use.

Fat interfaces force implementors to stub out methods they don't need. Split fat interfaces into focused, role-based ones.

```python
# VIOLATION: fat interface — not all workers do all things
class Worker(ABC):
    @abstractmethod
    def work(self): ...
    
    @abstractmethod
    def eat(self): ...          # Robots don't eat
    
    @abstractmethod
    def take_vacation(self): ... # Robots don't take vacation


class Robot(Worker):
    def work(self): print("Working")
    def eat(self): pass              # forced stub — ISP violation
    def take_vacation(self): pass    # forced stub — ISP violation


# CORRECT: segregated interfaces — take only what you need
class Workable(ABC):
    @abstractmethod
    def work(self): ...

class Feedable(ABC):
    @abstractmethod
    def eat(self): ...

class Vacationable(ABC):
    @abstractmethod
    def take_vacation(self): ...

class HumanWorker(Workable, Feedable, Vacationable):
    def work(self): ...
    def eat(self): ...
    def take_vacation(self): ...

class Robot(Workable):
    def work(self): ...   # only what a robot actually does
```

**ISP in repository design:**

```python
# Fat repository anti-pattern — reporting service shouldn't know about save/delete
class UserRepository(ABC):
    def find_by_id(self, id: str) -> User: ...
    def save(self, user: User): ...
    def delete(self, id: str): ...
    def find_all_active(self) -> list[User]: ...
    def count_by_country(self, country: str) -> int: ...  # reporting concern
    def find_high_value_customers(self) -> list[User]: ... # reporting concern


# ISP: segregate by consumer
class UserReadRepository(ABC):
    def find_by_id(self, id: str) -> User: ...
    def find_all_active(self) -> list[User]: ...

class UserWriteRepository(ABC):
    def save(self, user: User): ...
    def delete(self, id: str): ...

class UserReportingRepository(ABC):
    def count_by_country(self, country: str) -> int: ...
    def find_high_value_customers(self) -> list[User]: ...

# CQS: command services use Write, query services use Read, reporting uses Reporting
class UserService:
    def __init__(self, read_repo: UserReadRepository, write_repo: UserWriteRepository):
        self.read = read_repo
        self.write = write_repo
```

---

## D — Dependency Inversion Principle (DIP)

> High-level modules should not depend on low-level modules. Both should depend on abstractions.

The flow of source code dependencies must point toward abstractions, not toward concrete implementations. This is the foundation of testability and flexibility.

```python
# VIOLATION: high-level OrderService directly imports low-level MySQLOrderRepository
from infrastructure.mysql_order_repository import MySQLOrderRepository
from infrastructure.smtp_mailer import SMTPMailer

class OrderService:
    def __init__(self):
        self.repo = MySQLOrderRepository()   # concrete, can't swap for tests
        self.mailer = SMTPMailer()           # concrete, will actually send emails in tests
    
    def place_order(self, order: Order):
        self.repo.save(order)
        self.mailer.send(order.user_email, "Order placed!")


# CORRECT: OrderService depends on abstractions, not concretions
from abc import ABC, abstractmethod

class OrderRepository(ABC):          # abstraction in the domain layer
    @abstractmethod
    def save(self, order: Order): ...

class Mailer(ABC):                   # abstraction in the domain layer
    @abstractmethod
    def send(self, to: str, message: str): ...

class OrderService:
    def __init__(self, repo: OrderRepository, mailer: Mailer):
        self.repo = repo
        self.mailer = mailer
    
    def place_order(self, order: Order):
        self.repo.save(order)
        self.mailer.send(order.user_email, "Order placed!")

# In production:
service = OrderService(MySQLOrderRepository(), SMTPMailer())

# In tests:
service = OrderService(InMemoryOrderRepository(), FakeMailer())
```

**The dependency flow direction:**

```
WRONG (depends on concretions):
  OrderService → MySQLOrderRepository
  OrderService → SMTPMailer
  
CORRECT (depends on abstractions):
  OrderService → OrderRepository (abstract)
                      ↑
              MySQLOrderRepository (concrete, implements abstract)
  
  OrderService → Mailer (abstract)
                    ↑
              SMTPMailer (concrete, implements abstract)
```

**DIP is not DI (Dependency Injection).** DIP is the principle (depend on abstractions). DI is the technique used to achieve it (inject dependencies from the outside). See [IoC & Dependency Injection](ioc-di.md).

---

## SOLID violations quick diagnostic

| Symptom | Likely violation |
|---|---|
| Changing one class breaks another unrelated class | SRP — too many responsibilities |
| Adding a new type requires modifying existing `if/elif` chains | OCP — needs abstraction |
| Tests break when you swap a subclass in | LSP — subclass breaks parent's contract |
| Implementation has empty or `raise NotImplementedError` methods | ISP — interface is too fat |
| Unit tests require a real database or real SMTP server | DIP — depends on concretions |
| "I can't test this without mocking everything" | DIP — high coupling to concrete implementations |

---

## How SOLID principles relate

```
SRP  → clear ownership, one reason to change per class
OCP  → add new behavior by adding code, not editing existing
LSP  → inheritance hierarchies are actually substitutable
ISP  → interfaces are lean; consumers get exactly what they need
DIP  → high-level policy doesn't depend on low-level mechanism

SRP + ISP → fine-grained classes and interfaces
OCP + DIP → extension without touching existing code
DIP       → enables everything else (testability, swappability)
```

---

## Interview talking points

!!! tip "Key things to say"
    1. DIP is the most impactful — it's what makes a system testable and extensible
    2. LSP: if your subclass has stubbed-out or `raise NotImplementedError` methods, rethink the hierarchy
    3. OCP doesn't mean "never change code" — it means "adding features shouldn't modify working code"
    4. ISP: the right question is "does every caller of this interface use every method?"
    5. SRP: "one reason to change" is about actors/stakeholders, not "doing one thing"

## Related topics

- [IoC & Dependency Injection](ioc-di.md) — how DIP is implemented in practice
- [Design Patterns](design-patterns.md) — Strategy, Factory, Observer all implement OCP/DIP
- [Clean Architecture](clean-architecture.md) — DIP applied at the architectural level
