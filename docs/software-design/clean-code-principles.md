# Clean Code Principles

These are the foundational heuristics that separate code that works from code that can be maintained, extended, and understood by others (including future you).

## DRY — Don't Repeat Yourself

Every piece of knowledge must have a single, unambiguous representation in the system.

```python
# VIOLATION: duplicated logic
def calculate_order_tax(order):
    if order.country == 'US':
        return order.subtotal * 0.08
    elif order.country == 'UK':
        return order.subtotal * 0.20

def calculate_invoice_tax(invoice):
    if invoice.country == 'US':           # same logic duplicated
        return invoice.amount * 0.08
    elif invoice.country == 'UK':
        return invoice.amount * 0.20


# CORRECT: single source of truth
TAX_RATES = {'US': 0.08, 'UK': 0.20}

def calculate_tax(amount: float, country: str) -> float:
    rate = TAX_RATES.get(country, 0.0)
    return amount * rate

def calculate_order_tax(order):
    return calculate_tax(order.subtotal, order.country)

def calculate_invoice_tax(invoice):
    return calculate_tax(invoice.amount, invoice.country)
```

**DRY is about knowledge, not text.** Two similar-looking pieces of code that represent different business concepts are NOT a DRY violation — don't merge them. Merging coincidentally similar code creates wrong coupling that's painful to separate later.

```python
# These look similar but represent DIFFERENT concepts — do NOT merge
def validate_user_email(email: str) -> bool:
    return '@' in email and '.' in email.split('@')[1]

def validate_contact_email(email: str) -> bool:
    return '@' in email and '.' in email.split('@')[1]

# User email and contact email have different validation rules in the future.
# Merging them into one function couples unrelated business rules.
```

---

## KISS — Keep It Simple, Stupid

The simplest solution that works is usually the right one. Complexity must earn its place.

```python
# OVER-ENGINEERED: solving a problem that doesn't exist
class UserNameFormatterFactory:
    def create_formatter(self, strategy: str) -> 'UserNameFormatter':
        strategies = {
            'full': FullNameFormatter(),
            'first': FirstNameFormatter(),
        }
        return strategies[strategy]

class FullNameFormatter:
    def format(self, user) -> str:
        return f"{user.first_name} {user.last_name}"


# KISS: just write the function
def format_full_name(user) -> str:
    return f"{user.first_name} {user.last_name}"
```

**When complexity is justified:** when the domain genuinely requires it, when multiple callers need different behavior, or when the simple version demonstrably doesn't scale. Not before.

**Symptoms of KISS violation:**
- You need to read 5 files to understand what a function does
- Junior devs can't make a change without fear of breaking something unexpected
- The abstraction is more complex than the problem it solves

---

## YAGNI — You Aren't Gonna Need It

Don't add functionality until it's actually needed. Building for hypothetical future requirements is waste.

```python
# YAGNI violation: building for futures that may never come
class UserRepository:
    def find_by_id(self, user_id: str) -> User: ...
    def find_by_email(self, email: str) -> User: ...
    def find_by_username(self, username: str) -> User: ...
    def find_by_phone(self, phone: str) -> User: ...      # nobody asked for this
    def find_by_external_id(self, ext_id: str) -> User: ...  # hypothetical future integration
    def bulk_find(self, ids: list) -> list[User]: ...        # "we might need it later"
    def find_with_cursor(self, cursor: str) -> Page[User]: ...  # pre-optimizing

# YAGNI: implement what's needed now
class UserRepository:
    def find_by_id(self, user_id: str) -> User: ...
    def find_by_email(self, email: str) -> User: ...
    # Add more when a real caller needs them
```

**The cost of YAGNI violation:**
- Code that nobody reads or tests
- Future changes have to navigate around unused code
- API surface grows, making the system harder to understand

**YAGNI does not mean "never plan ahead"** — it means don't write code for requirements that don't exist yet. Design for extensibility (Open/Closed), but don't implement extensions.

---

## Separation of Concerns (SoC)

Each module, class, or function should be responsible for one cohesive concern. Concerns should not bleed across boundaries.

```python
# VIOLATION: one function handles HTTP parsing, business logic, AND data persistence
def handle_create_order(request):
    # HTTP layer concern
    user_id = request.headers.get('X-User-ID')
    body = json.loads(request.body)
    
    # Business logic concern
    if body['total'] > 10000:
        apply_bulk_discount(body)
    inventory = check_inventory(body['items'])
    if not inventory.sufficient:
        return {'error': 'Out of stock'}, 400
    
    # Persistence concern
    order = Order(**body, user_id=user_id)
    db.session.add(order)
    db.session.commit()
    
    # Notification concern
    send_confirmation_email(user_id, order.id)
    
    return {'order_id': order.id}, 201


# CORRECT: each concern in its own layer
# Handler: HTTP boundary only
def handle_create_order(request):
    user_id = request.headers.get('X-User-ID')
    body = CreateOrderRequest(**json.loads(request.body))
    order = order_service.create_order(user_id, body)
    return {'order_id': order.id}, 201

# Service: business logic only
class OrderService:
    def create_order(self, user_id: str, req: CreateOrderRequest) -> Order:
        self._validate_inventory(req.items)
        order = Order.from_request(user_id, req)
        if order.total > 10000:
            order.apply_bulk_discount()
        order = self.order_repo.save(order)
        self.event_bus.publish(OrderCreated(order_id=order.id, user_id=user_id))
        return order

# Repository: persistence only
class OrderRepository:
    def save(self, order: Order) -> Order: ...

# Event handler: notification concern
class OrderCreatedHandler:
    def handle(self, event: OrderCreated):
        self.email_service.send_confirmation(event.user_id, event.order_id)
```

---

## Law of Demeter (Principle of Least Knowledge)

A unit should only talk to its immediate collaborators. Don't reach through objects to get what you need.

```python
# VIOLATION: train wreck — reaching through object chains
def apply_discount(order):
    # Depends on Order → Customer → Membership → level
    if order.customer.membership.level == 'gold':
        order.discount = 0.15

# CORRECT: ask the object, don't dig into it
def apply_discount(order):
    if order.customer.is_gold_member():
        order.discount = 0.15

# Or better: move the logic to Order itself
class Order:
    def apply_membership_discount(self):
        self.discount = self.customer.membership_discount_rate()
```

**Why it matters:** Train-wreck code couples you to the internal structure of every object in the chain. When `membership` moves from `customer` to somewhere else, every chain that traverses it breaks.

---

## Composition over Inheritance

Prefer composing behaviors from smaller parts over building deep inheritance hierarchies.

```python
# INHERITANCE problem: rigid hierarchy
class Animal:
    def breathe(self): ...

class FlyingAnimal(Animal):
    def fly(self): ...

class SwimmingAnimal(Animal):
    def swim(self): ...

# What about a duck? Multiple inheritance gets messy fast.
class Duck(FlyingAnimal, SwimmingAnimal):  # fragile, order-dependent
    pass


# COMPOSITION: mix in only what's needed
class Flyable:
    def fly(self): print("Flying")

class Swimmable:
    def swim(self): print("Swimming")

class Duck:
    def __init__(self):
        self.fly_behavior = Flyable()
        self.swim_behavior = Swimmable()
    
    def fly(self): self.fly_behavior.fly()
    def swim(self): self.swim_behavior.swim()
```

**Inheritance is appropriate when:** there is a true IS-A relationship and the subclass really is a more specific type of the parent (Liskov Substitution holds). For reusing behavior, prefer composition.

---

## Fail Fast

Detect and report errors as early as possible, as close to the source as possible. Don't propagate bad state deep into the system.

```python
# FAIL SLOW: bad data travels far before the error surfaces
def process_payment(order_id: str, amount):
    order = db.get_order(order_id)  # may return None
    total = order.total + amount    # NullPointerException here — far from root cause
    charge_card(order.card_token, total)


# FAIL FAST: validate at the boundary
def process_payment(order_id: str, amount: float):
    if not order_id:
        raise ValueError("order_id is required")
    if amount <= 0:
        raise ValueError(f"amount must be positive, got {amount}")
    
    order = db.get_order(order_id)
    if order is None:
        raise NotFoundError(f"Order {order_id} not found")
    if order.status != 'pending':
        raise InvalidStateError(f"Cannot pay order in status {order.status}")
    
    charge_card(order.card_token, order.total + amount)
```

**Fail fast with invariants:**

```python
class Money:
    def __init__(self, amount: float, currency: str):
        if amount < 0:
            raise ValueError(f"Money cannot be negative: {amount}")
        if currency not in SUPPORTED_CURRENCIES:
            raise ValueError(f"Unsupported currency: {currency}")
        self._amount = amount
        self._currency = currency
    
    # Object is always valid after construction — no partial state
```

---

## Tell, Don't Ask

Instead of asking an object for its state and then making decisions, tell the object what to do.

```python
# ASK: pulling state out to make decisions externally
def process_order(order):
    if order.status == 'pending' and order.payment_verified and not order.cancelled:
        order.status = 'processing'
        order.processed_at = datetime.now()


# TELL: push decisions into the object
def process_order(order):
    order.start_processing()  # Order knows its own invariants

class Order:
    def start_processing(self):
        if self.status != 'pending':
            raise InvalidStateError(f"Cannot process order in status {self.status}")
        if not self.payment_verified:
            raise PaymentError("Payment must be verified before processing")
        self.status = 'processing'
        self.processed_at = datetime.now()
```

---

## Quick reference

| Principle | One-liner | Violation smell |
|---|---|---|
| DRY | One source of truth for each piece of knowledge | Copy-paste, duplicate logic |
| KISS | Simplest solution that works | Over-engineered abstractions |
| YAGNI | Don't build what isn't needed yet | Unused code, hypothetical APIs |
| SoC | One concern per module | Functions that do 5 things |
| Law of Demeter | Talk to friends, not strangers' friends | `a.b.c.d.method()` |
| Composition over Inheritance | Favor HAS-A over IS-A | Deep inheritance hierarchies |
| Fail Fast | Validate early, fail at the source | NullPointerException deep in a call stack |
| Tell, Don't Ask | Push behavior into objects | External code managing object state |

---

## Interview talking points

!!! tip "Key things to say"
    1. DRY is about knowledge, not text — coincidentally similar code shouldn't be merged
    2. YAGNI and SoC together: don't add concerns to a module "just in case"
    3. Law of Demeter reduces coupling — train-wreck chains are brittle to refactoring
    4. Tell, Don't Ask leads naturally to better encapsulation and smaller public APIs

## Related topics

- [SOLID Principles](solid.md) — formalizes SoC and Tell-Don't-Ask into specific rules
- [IoC & Dependency Injection](ioc-di.md) — applies these principles to component wiring
- [Design Patterns](design-patterns.md) — patterns that embody these principles
