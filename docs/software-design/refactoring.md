# Refactoring & Code Smells

Refactoring is changing the structure of existing code without changing its observable behavior. Code smells are patterns that indicate deeper problems — they're not always bugs, but they make code harder to change, test, and understand.

> *"Any fool can write code that a computer can understand. Good programmers write code that humans can understand."* — Martin Fowler

---

## The core principle

Refactoring is safe only when backed by tests. The workflow:

```
1. Write tests (if missing)
2. Make one small structural change
3. Run tests — still green?
4. Commit
5. Repeat
```

Never refactor and change behavior at the same time. If you need to fix a bug, fix it first (with a test), commit, then refactor.

---

## Code smells

### Long Method

The most common smell. Methods longer than ~20 lines are hard to name, test, and understand.

```python
# Smell: 60-line method doing everything
def process_order(order):
    # validate...
    # calculate totals...
    # apply discounts...
    # check inventory...
    # charge payment...
    # send confirmation...
    # update analytics...

# Refactored: each step is named and independently testable
def process_order(order):
    validate_order(order)
    total = calculate_total(order)
    apply_discounts(order, total)
    reserve_inventory(order)
    charge_payment(order, total)
    send_confirmation(order)
```

**Rule of thumb:** If a block of code needs a comment to explain it, extract it into a method named after what it does.

### Large Class (God Object)

A class that knows too much and does too much. Violates SRP.

```python
# Smell: UserManager does everything related to users
class UserManager:
    def register(self): ...
    def login(self): ...
    def send_welcome_email(self): ...
    def upload_avatar(self): ...
    def calculate_billing(self): ...
    def generate_report(self): ...

# Refactored: each responsibility in its own class
class UserAuthService: ...       # registration, login
class UserNotificationService: ...  # emails
class UserBillingService: ...    # billing
class UserAvatarService: ...     # avatar management
```

### Long Parameter List

More than 3-4 parameters is a sign the function is doing too much, or parameters should be grouped.

```python
# Smell
def create_user(first_name, last_name, email, phone, address, city, country, role, plan):
    ...

# Refactored: parameter object
@dataclass
class UserRegistration:
    first_name: str
    last_name: str
    email: str
    phone: str
    address: Address
    role: str
    plan: str

def create_user(registration: UserRegistration):
    ...
```

### Duplicate Code

The same code in two places will inevitably diverge. One gets fixed, the other stays broken.

```python
# Smell: same discount logic in two places
def checkout_discount(order):
    if order.total > 100:
        return order.total * 0.1
    return 0

def apply_coupon_discount(order):
    if order.total > 100:
        return order.total * 0.1   # copy-pasted
    return 0

# Refactored
def calculate_volume_discount(total: float) -> float:
    return total * 0.1 if total > 100 else 0
```

### Feature Envy

A method that is more interested in another class's data than its own. Sign that the method belongs elsewhere.

```python
# Smell: OrderProcessor accessing Customer data extensively
class OrderProcessor:
    def calculate_discount(self, order, customer):
        if customer.membership == "gold" and customer.years_active > 2:
            if customer.total_spend > 10000:
                return order.total * 0.2

# Refactored: move the method to Customer
class Customer:
    def discount_rate(self) -> float:
        if self.membership == "gold" and self.years_active > 2:
            if self.total_spend > 10000:
                return 0.2
        return 0.0

class OrderProcessor:
    def calculate_discount(self, order, customer):
        return order.total * customer.discount_rate()
```

### Data Clumps

Groups of data that always appear together. They should be a class.

```python
# Smell: city, state, zip always travel together
def ship_order(order, street, city, state, zip_code, country): ...
def send_invoice(user, street, city, state, zip_code, country): ...

# Refactored
@dataclass
class Address:
    street: str
    city: str
    state: str
    zip_code: str
    country: str

def ship_order(order, address: Address): ...
def send_invoice(user, address: Address): ...
```

### Primitive Obsession

Using raw primitives (strings, ints) for domain concepts. Loses type safety and allows invalid states.

```python
# Smell: email and user_id are just strings/ints
def send_email(email: str, subject: str): ...
def get_user(user_id: int): ...
# Can pass any string as an email, any int as a user_id

# Refactored: wrap in value objects
@dataclass(frozen=True)
class Email:
    value: str
    def __post_init__(self):
        if "@" not in self.value:
            raise ValueError(f"Invalid email: {self.value}")

@dataclass(frozen=True)
class UserId:
    value: int

def send_email(email: Email, subject: str): ...
def get_user(user_id: UserId): ...
```

### Shotgun Surgery

One change requires modifications in many different places. Usually a sign that related logic is scattered.

```
Adding a new payment method requires changing:
  - PaymentFactory
  - PaymentProcessor
  - PaymentValidator
  - InvoiceService
  - ReportGenerator
  - AdminDashboard

Fix: consolidate payment logic → one place changes when payment logic changes
```

### Divergent Change

One class changes for many different reasons. Opposite of Shotgun Surgery — violates SRP.

```
OrderService changes when:
  - pricing rules change
  - notification templates change
  - inventory logic changes
  - reporting requirements change

Fix: split into PricingService, NotificationService, InventoryService, OrderReportService
```

---

## Core refactoring techniques

### Extract Method

```python
# Before
def print_owing(order):
    print("*" * 20)
    print("Customer: " + order.customer.name)
    print("Amount: " + str(order.total))
    print("*" * 20)
    # ... 30 more lines

# After
def print_owing(order):
    print_banner()
    print_details(order)

def print_banner():
    print("*" * 20)

def print_details(order):
    print("Customer: " + order.customer.name)
    print("Amount: " + str(order.total))
```

### Extract Class

When a class has too many responsibilities, split it.

```python
# Before: Person has name + phone data
class Person:
    def __init__(self):
        self.name = ""
        self.office_area_code = ""
        self.office_number = ""

# After: phone logic in its own class
class TelephoneNumber:
    def __init__(self, area_code, number):
        self.area_code = area_code
        self.number = number

class Person:
    def __init__(self, name, office_phone: TelephoneNumber):
        self.name = name
        self.office_phone = office_phone
```

### Replace Conditional with Polymorphism

```python
# Before: type-based conditionals scattered everywhere
def get_speed(bird):
    if bird.type == "EUROPEAN":
        return base_speed()
    elif bird.type == "AFRICAN":
        return base_speed() - load_factor() * bird.number_of_coconuts
    elif bird.type == "NORWEGIAN_BLUE":
        return 0 if bird.is_nailed else base_speed(bird.voltage)

# After: each type knows its own speed
class EuropeanSwallow:
    def speed(self): return base_speed()

class AfricanSwallow:
    def speed(self): return base_speed() - load_factor() * self.number_of_coconuts

class NorwegianBlueParrot:
    def speed(self): return 0 if self.is_nailed else base_speed(self.voltage)
```

### Introduce Parameter Object / Replace Temp with Query

```python
# Replace inline temp variables that are computed from data
# Before
def calculate_discount(order):
    base_price = order.quantity * order.item_price
    if base_price > 1000:
        return base_price * 0.95
    return base_price * 0.98

# After: base_price is a query on the order
class Order:
    @property
    def base_price(self):
        return self.quantity * self.item_price

    def calculate_discount(self):
        if self.base_price > 1000:
            return self.base_price * 0.95
        return self.base_price * 0.98
```

---

## When NOT to refactor

- **When you don't have tests.** Refactoring without tests is rewriting with extra risk.
- **When you're on a deadline.** Note it as tech debt; refactor in the next quiet period.
- **When the code works and won't change.** Perfect is the enemy of good.
- **When it's a rewrite.** Refactoring is incremental. If you're rewriting from scratch, that's different.

---

## Refactoring and system design

Smells that specifically signal architectural problems:

| Smell | Architectural implication |
|---|---|
| Shotgun Surgery across services | Services are too coupled — shared logic belongs in one place |
| Feature Envy between modules | Module boundary is in the wrong place |
| God Service | Service has too many responsibilities — split it |
| Shared Database | Two services that share a DB table are implicitly coupled |

---

## Interview angle

!!! tip "Refactoring in interviews"
    - *"How do you approach technical debt?"* → Identify the specific smell (duplicate logic, large class). Wrap in tests. Extract incrementally. Don't do it all at once.
    - *"What would you change about this code?"* → Name the smell first ("this is feature envy — `calculate_discount` belongs on `Customer`, not `OrderProcessor`"), then show the refactor.

## Related topics

- [Clean Code Principles](clean-code-principles.md) — DRY, KISS, SRP
- [SOLID Principles](solid.md) — the principles smells violate
- [Testing Strategies](testing-strategies.md) — tests are the safety net for refactoring
- [Design Patterns](design-patterns.md) — Replace Conditional with Polymorphism uses Strategy/Polymorphism
