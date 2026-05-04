# Design Patterns (GoF)

The 23 Gang of Four patterns grouped into three categories. Each pattern is a proven solution to a recurring design problem. This covers the ~15 patterns you'll encounter most frequently in production systems and interviews.

---

## Creational Patterns

Control object creation — how, when, and by whom objects are created.

### Factory Method

Define an interface for creating an object, but let subclasses decide which class to instantiate.

```python
from abc import ABC, abstractmethod

class Notification(ABC):
    @abstractmethod
    def send(self, recipient: str, message: str): ...

class EmailNotification(Notification):
    def send(self, recipient: str, message: str):
        print(f"Email to {recipient}: {message}")

class SMSNotification(Notification):
    def send(self, recipient: str, message: str):
        print(f"SMS to {recipient}: {message}")

class PushNotification(Notification):
    def send(self, recipient: str, message: str):
        print(f"Push to {recipient}: {message}")

# Factory: maps a string/config to the right concrete class
class NotificationFactory:
    _creators = {
        'email': EmailNotification,
        'sms': SMSNotification,
        'push': PushNotification,
    }
    
    @classmethod
    def create(cls, channel: str) -> Notification:
        creator = cls._creators.get(channel)
        if not creator:
            raise ValueError(f"Unknown notification channel: {channel}")
        return creator()
    
    @classmethod
    def register(cls, channel: str, creator: type):
        """Extension point — add new channels without modifying factory (OCP)"""
        cls._creators[channel] = creator

# Usage — caller doesn't need to know concrete types
notif = NotificationFactory.create('email')
notif.send('alice@example.com', 'Your order shipped')
```

**When to use:** When you need to decouple creation from usage, when the concrete type depends on config/runtime input.

---

### Abstract Factory

Factory of factories — creates families of related objects without specifying their concrete classes.

```python
# Problem: UI components must match the OS theme (Windows vs Mac vs Linux)
class Button(ABC):
    @abstractmethod
    def render(self): ...

class Checkbox(ABC):
    @abstractmethod
    def render(self): ...

# Windows family
class WindowsButton(Button):
    def render(self): print("[ Windows Button ]")

class WindowsCheckbox(Checkbox):
    def render(self): print("[x] Windows Checkbox")

# Mac family
class MacButton(Button):
    def render(self): print("( Mac Button )")

class MacCheckbox(Checkbox):
    def render(self): print("◉ Mac Checkbox")

# Abstract factory
class UIFactory(ABC):
    @abstractmethod
    def create_button(self) -> Button: ...
    
    @abstractmethod
    def create_checkbox(self) -> Checkbox: ...

class WindowsUIFactory(UIFactory):
    def create_button(self) -> Button: return WindowsButton()
    def create_checkbox(self) -> Checkbox: return WindowsCheckbox()

class MacUIFactory(UIFactory):
    def create_button(self) -> Button: return MacButton()
    def create_checkbox(self) -> Checkbox: return MacCheckbox()

# Application uses only the abstract factory — never references concrete classes
class Application:
    def __init__(self, factory: UIFactory):
        self.button = factory.create_button()
        self.checkbox = factory.create_checkbox()
    
    def render(self):
        self.button.render()
        self.checkbox.render()

# Wire up based on OS
factory = WindowsUIFactory() if os.name == 'nt' else MacUIFactory()
app = Application(factory)
```

**When to use:** When products must be used together (same theme), and you want to enforce that constraint.

---

### Builder

Construct complex objects step by step. Separate construction from representation.

```python
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class HttpRequest:
    method: str
    url: str
    headers: dict = field(default_factory=dict)
    body: Optional[bytes] = None
    timeout: int = 30
    retries: int = 0
    auth_token: Optional[str] = None

class HttpRequestBuilder:
    def __init__(self, method: str, url: str):
        self._method = method
        self._url = url
        self._headers: dict = {}
        self._body: Optional[bytes] = None
        self._timeout = 30
        self._retries = 0
        self._auth_token: Optional[str] = None
    
    def header(self, key: str, value: str) -> 'HttpRequestBuilder':
        self._headers[key] = value
        return self  # fluent interface
    
    def json_body(self, data: dict) -> 'HttpRequestBuilder':
        import json
        self._body = json.dumps(data).encode()
        self._headers['Content-Type'] = 'application/json'
        return self
    
    def timeout(self, seconds: int) -> 'HttpRequestBuilder':
        self._timeout = seconds
        return self
    
    def with_retry(self, max_attempts: int) -> 'HttpRequestBuilder':
        self._retries = max_attempts
        return self
    
    def bearer_auth(self, token: str) -> 'HttpRequestBuilder':
        self._auth_token = token
        self._headers['Authorization'] = f'Bearer {token}'
        return self
    
    def build(self) -> HttpRequest:
        return HttpRequest(
            method=self._method,
            url=self._url,
            headers=self._headers,
            body=self._body,
            timeout=self._timeout,
            retries=self._retries,
            auth_token=self._auth_token,
        )

# Fluent API — readable, no positional parameter confusion
request = (HttpRequestBuilder('POST', 'https://api.example.com/orders')
    .json_body({'item_id': 'abc', 'quantity': 2})
    .bearer_auth(token)
    .timeout(10)
    .with_retry(3)
    .build())
```

**When to use:** Complex objects with many optional fields, where different configurations are needed by different callers. Avoids telescoping constructors.

---

### Singleton

Ensure a class has only one instance and provide a global access point.

```python
import threading

class DatabaseConnectionPool:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:         # double-checked locking for thread safety
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._pool = create_pool(max_connections=20)
        self._initialized = True

# Same object every time
pool1 = DatabaseConnectionPool()
pool2 = DatabaseConnectionPool()
assert pool1 is pool2
```

**The Singleton problem — and why to avoid it:**

```python
# Singleton creates hidden global state
class Config:
    _instance = None
    
    def get(self, key: str): ...

# This function secretly depends on Config singleton — invisible coupling
def calculate_tax(amount: float) -> float:
    rate = Config().get('tax_rate')  # hidden dependency!
    return amount * rate

# Tests can't control what Config returns without modifying global state
# → Use DI instead: pass Config/rate explicitly
def calculate_tax(amount: float, tax_rate: float) -> float:
    return amount * tax_rate
```

**Legitimate singleton uses:** connection pools, logger instances, application config loaded once at startup. **Avoid** using singleton as a substitute for dependency injection.

---

### Prototype

Create new objects by copying an existing object (the prototype).

```python
import copy

class QueryTemplate:
    def __init__(self, base_sql: str, filters: dict, limit: int):
        self.base_sql = base_sql
        self.filters = filters.copy()
        self.limit = limit
    
    def clone(self) -> 'QueryTemplate':
        return copy.deepcopy(self)
    
    def with_filter(self, key: str, value) -> 'QueryTemplate':
        clone = self.clone()
        clone.filters[key] = value
        return clone

# Base template
base_query = QueryTemplate("SELECT * FROM orders", {}, limit=100)

# Clone and customize
active_orders = base_query.with_filter('status', 'active')
cancelled_orders = base_query.with_filter('status', 'cancelled')
```

**When to use:** When creating an object is expensive (complex initialization), and new objects differ only slightly from an existing one.

---

## Structural Patterns

How classes and objects are composed to form larger structures.

### Adapter

Convert the interface of a class into another interface clients expect. Makes incompatible interfaces work together.

```python
# Third-party payment SDK with its own interface
class StripeAPI:
    def create_charge(self, amount_cents: int, currency: str, source: str) -> dict:
        # Stripe-specific implementation
        return {'id': 'ch_abc123', 'status': 'succeeded'}

# Your application's interface — what your code expects
class PaymentGateway(ABC):
    @abstractmethod
    def charge(self, amount: float, currency: str, token: str) -> str: ...

# Adapter: wraps Stripe to match your interface
class StripeAdapter(PaymentGateway):
    def __init__(self, stripe: StripeAPI):
        self._stripe = stripe
    
    def charge(self, amount: float, currency: str, token: str) -> str:
        # Adapt: float dollars → int cents, different param names
        amount_cents = int(amount * 100)
        result = self._stripe.create_charge(amount_cents, currency, source=token)
        return result['id']

# Your code only knows about PaymentGateway — never knows about Stripe
gateway = StripeAdapter(StripeAPI())
payment_id = gateway.charge(49.99, 'USD', card_token)
```

**When to use:** Integrating third-party libraries with incompatible interfaces, migrating legacy code to a new interface.

---

### Decorator

Attach additional responsibilities to an object dynamically. Extends behavior without subclassing.

```python
class DataExporter(ABC):
    @abstractmethod
    def export(self, data: list) -> bytes: ...

class CSVExporter(DataExporter):
    def export(self, data: list) -> bytes:
        lines = [','.join(str(v) for v in row) for row in data]
        return '\n'.join(lines).encode()

# Decorators wrap another DataExporter and add behavior
class CompressionDecorator(DataExporter):
    def __init__(self, wrapped: DataExporter):
        self._wrapped = wrapped
    
    def export(self, data: list) -> bytes:
        raw = self._wrapped.export(data)
        import gzip
        return gzip.compress(raw)

class EncryptionDecorator(DataExporter):
    def __init__(self, wrapped: DataExporter, key: bytes):
        self._wrapped = wrapped
        self._key = key
    
    def export(self, data: list) -> bytes:
        raw = self._wrapped.export(data)
        return encrypt(raw, self._key)  # encrypt after inner export

class LoggingDecorator(DataExporter):
    def __init__(self, wrapped: DataExporter):
        self._wrapped = wrapped
    
    def export(self, data: list) -> bytes:
        print(f"Exporting {len(data)} rows...")
        result = self._wrapped.export(data)
        print(f"Export complete: {len(result)} bytes")
        return result

# Compose decorators — order matters
exporter = LoggingDecorator(
    CompressionDecorator(
        EncryptionDecorator(
            CSVExporter(),
            key=encryption_key
        )
    )
)
result = exporter.export(data)
# Flow: Log → Compress → Encrypt → CSV (inner to outer for wrapping, outer to inner for execution)
```

**When to use:** Adding cross-cutting concerns (logging, caching, compression, auth) without modifying the core class. Python's `@functools.lru_cache`, `@property` are decorator pattern examples.

---

### Facade

Provide a simplified interface to a complex subsystem.

```python
# Complex subsystems — each has its own interface
class InventorySystem:
    def check_stock(self, sku: str) -> int: ...
    def reserve_items(self, sku: str, qty: int): ...

class PaymentSystem:
    def validate_card(self, token: str): ...
    def process_charge(self, amount: float, token: str) -> str: ...

class ShippingSystem:
    def calculate_rates(self, address: Address) -> list[Rate]: ...
    def create_shipment(self, order_id: str, address: Address, rate_id: str) -> str: ...

class NotificationSystem:
    def send_confirmation(self, user_id: str, order_id: str): ...

# Facade: single entry point that hides all the complexity
class CheckoutFacade:
    def __init__(self, inventory, payment, shipping, notification):
        self._inv = inventory
        self._pay = payment
        self._ship = shipping
        self._notif = notification
    
    def checkout(self, cart: Cart, user: User, card_token: str) -> Order:
        # 1. Check stock
        for item in cart.items:
            if self._inv.check_stock(item.sku) < item.quantity:
                raise OutOfStockError(item.sku)
        
        # 2. Reserve inventory
        for item in cart.items:
            self._inv.reserve_items(item.sku, item.quantity)
        
        # 3. Process payment
        self._pay.validate_card(card_token)
        charge_id = self._pay.process_charge(cart.total, card_token)
        
        # 4. Create shipment
        rates = self._ship.calculate_rates(user.address)
        shipment_id = self._ship.create_shipment(order.id, user.address, rates[0].id)
        
        # 5. Notify
        self._notif.send_confirmation(user.id, order.id)
        
        return order

# Caller only knows about CheckoutFacade — no knowledge of subsystems
checkout = CheckoutFacade(inventory, payment, shipping, notification)
order = checkout.checkout(cart, user, card_token)
```

**When to use:** Simplifying access to a complex subsystem for most callers. Expert callers can still use the subsystems directly if needed.

---

### Proxy

Provide a substitute that controls access to another object. The proxy and the real object share the same interface.

```python
# Use cases: lazy loading, caching, access control, logging

# Caching Proxy
class UserRepository(ABC):
    @abstractmethod
    def find_by_id(self, user_id: str) -> User: ...

class DBUserRepository(UserRepository):
    def find_by_id(self, user_id: str) -> User:
        return db.query(f"SELECT * FROM users WHERE id = '{user_id}'")

class CachingUserRepository(UserRepository):
    def __init__(self, real: UserRepository, cache: Cache, ttl: int = 300):
        self._real = real
        self._cache = cache
        self._ttl = ttl
    
    def find_by_id(self, user_id: str) -> User:
        cached = self._cache.get(f'user:{user_id}')
        if cached:
            return cached
        
        user = self._real.find_by_id(user_id)
        self._cache.set(f'user:{user_id}', user, ttl=self._ttl)
        return user

# Same interface — callers don't know if they're hitting DB or cache
repo: UserRepository = CachingUserRepository(DBUserRepository(), redis_cache)
user = repo.find_by_id('usr_123')
```

**Proxy vs Decorator:** Both wrap another object. Proxy controls access to the subject (same interface, hides the real object). Decorator adds behavior (wraps are transparent, often stacked).

---

### Composite

Compose objects into tree structures to represent part-whole hierarchies. Clients treat individual objects and compositions uniformly.

```python
# File system: files and directories are treated the same way
class FileSystemNode(ABC):
    @abstractmethod
    def size(self) -> int: ...
    
    @abstractmethod
    def display(self, indent: int = 0): ...

class File(FileSystemNode):
    def __init__(self, name: str, size_bytes: int):
        self.name = name
        self._size = size_bytes
    
    def size(self) -> int: return self._size
    def display(self, indent: int = 0): print(' ' * indent + f"📄 {self.name} ({self._size}B)")

class Directory(FileSystemNode):
    def __init__(self, name: str):
        self.name = name
        self._children: list[FileSystemNode] = []
    
    def add(self, node: FileSystemNode): self._children.append(node)
    
    def size(self) -> int:
        return sum(child.size() for child in self._children)
    
    def display(self, indent: int = 0):
        print(' ' * indent + f"📁 {self.name}/")
        for child in self._children:
            child.display(indent + 2)

# Build the tree
root = Directory('project')
src = Directory('src')
src.add(File('main.py', 4096))
src.add(File('utils.py', 2048))
root.add(src)
root.add(File('README.md', 512))

# Same method works on any node — file or directory
root.display()
print(f"Total: {root.size()}B")  # recursively sums everything
```

---

## Behavioral Patterns

How objects interact and distribute responsibility.

### Strategy

Define a family of algorithms, encapsulate each one, and make them interchangeable.

```python
from abc import ABC, abstractmethod

class SortStrategy(ABC):
    @abstractmethod
    def sort(self, data: list) -> list: ...

class QuickSort(SortStrategy):
    def sort(self, data: list) -> list:
        if len(data) <= 1: return data
        pivot = data[len(data) // 2]
        left = [x for x in data if x < pivot]
        middle = [x for x in data if x == pivot]
        right = [x for x in data if x > pivot]
        return self.sort(left) + middle + self.sort(right)

class MergeSort(SortStrategy):
    def sort(self, data: list) -> list:
        if len(data) <= 1: return data
        mid = len(data) // 2
        left = self.sort(data[:mid])
        right = self.sort(data[mid:])
        return self._merge(left, right)
    
    def _merge(self, left, right):
        result = []
        i = j = 0
        while i < len(left) and j < len(right):
            if left[i] <= right[j]: result.append(left[i]); i += 1
            else: result.append(right[j]); j += 1
        return result + left[i:] + right[j:]

class TimSort(SortStrategy):
    def sort(self, data: list) -> list:
        return sorted(data)  # Python's built-in

class DataProcessor:
    def __init__(self, sort_strategy: SortStrategy):
        self._strategy = sort_strategy
    
    def set_strategy(self, strategy: SortStrategy):
        self._strategy = strategy
    
    def process(self, data: list) -> list:
        return self._strategy.sort(data)

# Swap strategies at runtime
processor = DataProcessor(QuickSort())
result = processor.process([3, 1, 4, 1, 5, 9, 2, 6])

# For nearly-sorted data, switch to TimSort
processor.set_strategy(TimSort())
result = processor.process(nearly_sorted_data)
```

**Real-world uses:** Pricing strategies, routing algorithms, serialization formats, compression algorithms, auth mechanisms.

---

### Observer

Define a one-to-many dependency so that when one object changes state, all its dependents are notified automatically.

```python
from abc import ABC, abstractmethod
from typing import Any

class EventObserver(ABC):
    @abstractmethod
    def update(self, event_type: str, data: Any): ...

class EventPublisher:
    def __init__(self):
        self._observers: dict[str, list[EventObserver]] = {}
    
    def subscribe(self, event_type: str, observer: EventObserver):
        self._observers.setdefault(event_type, []).append(observer)
    
    def unsubscribe(self, event_type: str, observer: EventObserver):
        self._observers.get(event_type, []).remove(observer)
    
    def publish(self, event_type: str, data: Any):
        for observer in self._observers.get(event_type, []):
            observer.update(event_type, data)

# Concrete observers
class EmailNotifier(EventObserver):
    def update(self, event_type: str, data: Any):
        if event_type == 'order.placed':
            send_email(data['user_email'], "Order confirmed!")

class InventoryUpdater(EventObserver):
    def update(self, event_type: str, data: Any):
        if event_type == 'order.placed':
            reserve_stock(data['items'])

class AuditLogger(EventObserver):
    def update(self, event_type: str, data: Any):
        log.info(f"Event: {event_type} | Data: {data}")

# Wire up
bus = EventPublisher()
bus.subscribe('order.placed', EmailNotifier())
bus.subscribe('order.placed', InventoryUpdater())
bus.subscribe('order.placed', AuditLogger())
bus.subscribe('payment.failed', AuditLogger())

# When order is placed — all observers notified
bus.publish('order.placed', {'user_email': 'alice@example.com', 'items': [...]})
```

**When to use:** Decoupling events from their side effects. The publisher doesn't know what observers do, and observers don't know about each other. Foundation of event-driven architecture.

---

### Command

Encapsulate a request as an object, allowing parameterization, queuing, undo/redo, and logging.

```python
from abc import ABC, abstractmethod

class Command(ABC):
    @abstractmethod
    def execute(self): ...
    
    @abstractmethod
    def undo(self): ...

class TransferMoneyCommand(Command):
    def __init__(self, account_service, from_account: str, to_account: str, amount: float):
        self._svc = account_service
        self._from = from_account
        self._to = to_account
        self._amount = amount
        self._executed = False
    
    def execute(self):
        self._svc.debit(self._from, self._amount)
        self._svc.credit(self._to, self._amount)
        self._executed = True
    
    def undo(self):
        if not self._executed:
            raise RuntimeError("Cannot undo — command not executed")
        self._svc.debit(self._to, self._amount)
        self._svc.credit(self._from, self._amount)

# Command queue / scheduler
class CommandQueue:
    def __init__(self):
        self._queue: list[Command] = []
        self._history: list[Command] = []
    
    def enqueue(self, command: Command): self._queue.append(command)
    
    def execute_all(self):
        while self._queue:
            cmd = self._queue.pop(0)
            cmd.execute()
            self._history.append(cmd)
    
    def undo_last(self):
        if self._history:
            self._history.pop().undo()

# Usage — undo/redo support
queue = CommandQueue()
queue.enqueue(TransferMoneyCommand(svc, 'acc_alice', 'acc_bob', 500.00))
queue.execute_all()
queue.undo_last()  # transfer reversed
```

**Real-world uses:** Task queues, undo/redo stacks, transactional operations, scheduled jobs.

---

### Template Method

Define the skeleton of an algorithm in a base class, deferring some steps to subclasses.

```python
class DataImporter(ABC):
    """Template method defines the import algorithm skeleton"""
    
    def import_data(self, source: str):
        raw = self.read_data(source)          # step 1
        validated = self.validate(raw)         # step 2
        parsed = self.parse(validated)         # step 3
        self.save(parsed)                      # step 4
        self.on_complete(len(parsed))          # hook: optional override
    
    @abstractmethod
    def read_data(self, source: str) -> bytes: ...
    
    @abstractmethod
    def parse(self, data: bytes) -> list: ...
    
    def validate(self, data: bytes) -> bytes:
        if not data:
            raise ValueError("Empty data source")
        return data  # default validation — subclasses can override
    
    def save(self, records: list):
        db.bulk_insert(records)  # default save
    
    def on_complete(self, count: int):
        pass  # hook: no-op by default

class CSVImporter(DataImporter):
    def read_data(self, source: str) -> bytes:
        with open(source, 'rb') as f: return f.read()
    
    def parse(self, data: bytes) -> list:
        import csv, io
        return list(csv.DictReader(io.StringIO(data.decode())))

class APIImporter(DataImporter):
    def read_data(self, source: str) -> bytes:
        return requests.get(source).content
    
    def parse(self, data: bytes) -> list:
        return json.loads(data)
    
    def on_complete(self, count: int):
        metrics.increment('api_import_records', count)  # override hook
```

**Strategy vs Template Method:**
- Strategy: varies the whole algorithm — inject a strategy object
- Template Method: varies steps within a fixed algorithm — override methods in a subclass

---

### Chain of Responsibility

Pass a request along a chain of handlers. Each handler decides to process it or pass it to the next.

```python
from abc import ABC, abstractmethod
from typing import Optional

class Handler(ABC):
    def __init__(self):
        self._next: Optional['Handler'] = None
    
    def set_next(self, handler: 'Handler') -> 'Handler':
        self._next = handler
        return handler  # fluent: allows chaining
    
    @abstractmethod
    def handle(self, request: dict) -> Optional[dict]: ...
    
    def pass_to_next(self, request: dict) -> Optional[dict]:
        if self._next:
            return self._next.handle(request)
        return None

# Middleware chain for HTTP requests
class AuthHandler(Handler):
    def handle(self, request: dict) -> Optional[dict]:
        if not request.get('token'):
            return {'error': 'Unauthorized', 'status': 401}
        if not validate_token(request['token']):
            return {'error': 'Invalid token', 'status': 403}
        return self.pass_to_next(request)

class RateLimitHandler(Handler):
    def handle(self, request: dict) -> Optional[dict]:
        if is_rate_limited(request.get('user_id')):
            return {'error': 'Too many requests', 'status': 429}
        return self.pass_to_next(request)

class ValidationHandler(Handler):
    def handle(self, request: dict) -> Optional[dict]:
        if not request.get('body'):
            return {'error': 'Request body required', 'status': 400}
        return self.pass_to_next(request)

class BusinessLogicHandler(Handler):
    def handle(self, request: dict) -> Optional[dict]:
        result = process_business_logic(request['body'])
        return {'data': result, 'status': 200}

# Build chain
auth = AuthHandler()
auth.set_next(RateLimitHandler()).set_next(ValidationHandler()).set_next(BusinessLogicHandler())

response = auth.handle(incoming_request)
```

---

### State

Allow an object to alter its behavior when its internal state changes. The object will appear to change its class.

```python
from abc import ABC, abstractmethod

class OrderState(ABC):
    @abstractmethod
    def cancel(self, order: 'Order'): ...
    
    @abstractmethod
    def ship(self, order: 'Order'): ...
    
    @abstractmethod
    def deliver(self, order: 'Order'): ...

class PendingState(OrderState):
    def cancel(self, order): order.state = CancelledState(); order.status = 'cancelled'
    def ship(self, order): raise InvalidStateError("Cannot ship before payment")
    def deliver(self, order): raise InvalidStateError("Cannot deliver before shipping")

class PaidState(OrderState):
    def cancel(self, order): order.state = CancelledState(); issue_refund(order)
    def ship(self, order): order.state = ShippedState(); order.status = 'shipped'
    def deliver(self, order): raise InvalidStateError("Cannot deliver before shipping")

class ShippedState(OrderState):
    def cancel(self, order): raise InvalidStateError("Cannot cancel shipped order")
    def ship(self, order): raise InvalidStateError("Already shipped")
    def deliver(self, order): order.state = DeliveredState(); order.status = 'delivered'

class CancelledState(OrderState):
    def cancel(self, order): raise InvalidStateError("Already cancelled")
    def ship(self, order): raise InvalidStateError("Cannot ship cancelled order")
    def deliver(self, order): raise InvalidStateError("Cannot deliver cancelled order")

class DeliveredState(OrderState):
    def cancel(self, order): raise InvalidStateError("Cannot cancel delivered order")
    def ship(self, order): raise InvalidStateError("Cannot re-ship delivered order")
    def deliver(self, order): raise InvalidStateError("Already delivered")

class Order:
    def __init__(self): self.state: OrderState = PendingState()
    def cancel(self): self.state.cancel(self)
    def ship(self): self.state.ship(self)
    def deliver(self): self.state.deliver(self)
```

**State vs Strategy:**
- Strategy: algorithm is stateless — swapped externally by the caller
- State: state object is swapped internally by the context itself as it transitions

---

## Pattern quick reference

| Pattern | Category | Problem it solves |
|---|---|---|
| Factory Method | Creational | Which class to instantiate depends on runtime config |
| Abstract Factory | Creational | Create families of related objects |
| Builder | Creational | Complex object with many optional params |
| Singleton | Creational | One shared instance (use sparingly) |
| Prototype | Creational | Clone objects cheaply |
| Adapter | Structural | Make incompatible interfaces work together |
| Decorator | Structural | Add behavior without subclassing |
| Facade | Structural | Simplify a complex subsystem |
| Proxy | Structural | Control access (cache, auth, lazy load) |
| Composite | Structural | Tree structures, part-whole hierarchies |
| Strategy | Behavioral | Swap algorithms at runtime |
| Observer | Behavioral | One-to-many event notification |
| Command | Behavioral | Encapsulate requests; undo/queue/log |
| Template Method | Behavioral | Fixed algorithm with variable steps |
| Chain of Responsibility | Behavioral | Pipeline of handlers; middleware |
| State | Behavioral | Object behavior changes with state transitions |

---

## Interview talking points

!!! tip "Key things to say"
    1. Strategy vs Template Method: Strategy delegates the whole algorithm; Template Method just varies steps
    2. Proxy vs Decorator: Proxy controls access; Decorator adds behavior. Both share an interface with the wrapped object
    3. Observer is the foundation of event-driven architecture — decouple publisher from subscribers
    4. Singleton is often a DI anti-pattern in disguise — prefer injected singletons over static instances
    5. Builder avoids telescoping constructors — when you have >4 optional parameters, Builder should be considered

## Related topics

- [SOLID Principles](solid.md) — Strategy implements OCP; Observer implements DIP; Factory implements DIP
- [IoC & Dependency Injection](ioc-di.md) — most patterns are applied via DI
- [Clean Architecture](clean-architecture.md) — patterns compose into architectural layers
