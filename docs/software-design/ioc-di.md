# Inversion of Control & Dependency Injection

## Inversion of Control (IoC)

IoC is the broad principle: instead of your code controlling the flow and creation of its dependencies, you invert that control — a framework, container, or caller takes over.

**Traditional control flow:**
```
Your code creates its dependencies → your code calls them → your code owns everything
```

**Inverted control flow:**
```
Framework creates dependencies → injects them into your code → framework controls the wiring
```

The term "Hollywood Principle" captures this: *"Don't call us, we'll call you."*

IoC manifests in several forms:
- **Dependency Injection** — dependencies are provided to a class rather than created by it
- **Event-driven callbacks** — framework calls your code when an event fires (HTTP handler, event listener)
- **Template Method pattern** — base class calls your overridden methods
- **Service Locator** — your code asks a registry for dependencies (weaker form, usually an anti-pattern)

---

## Dependency Injection (DI)

DI is the most common form of IoC. Instead of a class creating its own dependencies with `new`/constructor calls, dependencies are *injected* from the outside.

### The problem DI solves

```python
# No DI: OrderService is coupled to concrete implementations
class OrderService:
    def __init__(self):
        # Hard-coded concretions — can't swap, can't test
        self.repo = MySQLOrderRepository(
            host='prod-db.internal',
            password=os.environ['DB_PASSWORD'],
        )
        self.mailer = SMTPMailer(smtp_host='mail.internal')
        self.payment = StripeGateway(api_key=os.environ['STRIPE_KEY'])
    
    def place_order(self, order: Order):
        self.payment.charge(order.total)
        self.repo.save(order)
        self.mailer.send(order.user.email, "Your order is confirmed")
```

Problems:
- Unit testing requires a real DB, real SMTP, real Stripe
- Can't swap MySQL for Postgres without editing `OrderService`
- `OrderService` knows about infrastructure concerns (hosts, passwords, API keys)
- Every test that uses `OrderService` risks sending real emails

### Constructor Injection (preferred)

```python
# Dependencies declared as constructor parameters — explicit, testable
class OrderService:
    def __init__(
        self,
        repo: OrderRepository,       # abstract interface
        mailer: Mailer,              # abstract interface
        payment: PaymentGateway,     # abstract interface
    ):
        self.repo = repo
        self.mailer = mailer
        self.payment = payment
    
    def place_order(self, order: Order):
        self.payment.charge(order.total)
        self.repo.save(order)
        self.mailer.send(order.user.email, "Your order is confirmed")

# Production wiring (in your composition root)
order_service = OrderService(
    repo=MySQLOrderRepository(db_pool),
    mailer=SMTPMailer(smtp_config),
    payment=StripeGateway(stripe_key),
)

# Test wiring — no real infrastructure
order_service = OrderService(
    repo=InMemoryOrderRepository(),
    mailer=FakeMailer(),
    payment=FakePaymentGateway(),
)
```

**Why constructor injection is preferred:**
- Dependencies are explicit in the signature — you can see what a class needs at a glance
- Object is fully ready after construction — no partial initialization
- Immutable references — dependencies don't change after construction
- Forces you to think about a class's dependencies during design

### Setter Injection

```python
# Dependencies set via setter methods after construction
class OrderService:
    def __init__(self):
        self.repo: OrderRepository = None
        self.mailer: Mailer = None
    
    def set_repo(self, repo: OrderRepository): self.repo = repo
    def set_mailer(self, mailer: Mailer): self.mailer = mailer

service = OrderService()
service.set_repo(MySQLOrderRepository(db_pool))
service.set_mailer(SMTPMailer(smtp_config))
```

**When to use setter injection:**
- Optional dependencies (the class works without them, just with reduced functionality)
- Circular dependencies that can't be resolved via constructor (usually a design smell)
- When you need to reconfigure a long-lived object at runtime

**Avoid setter injection for required dependencies** — the class is in an invalid state between construction and the setter calls.

### Interface Injection

```python
# The dependency provides an injector interface
class MailerAware(ABC):
    @abstractmethod
    def inject_mailer(self, mailer: Mailer): ...

class OrderService(MailerAware):
    def inject_mailer(self, mailer: Mailer):
        self.mailer = mailer
```

Rarely used in Python/modern languages. Common in Java (via `@Inject` annotations). Not recommended for new designs.

---

## DI Containers

A DI container (also called an IoC container) automates the wiring of objects. You register types and their dependencies; the container resolves and instantiates the full dependency graph.

### Manual DI (Pure DI)

No framework — you wire everything by hand in one place: the **composition root**.

```python
# composition_root.py — the ONLY place where concretions are mentioned
def build_app() -> FastAPI:
    # Infrastructure
    db_pool = create_db_pool(settings.DATABASE_URL)
    smtp = create_smtp_client(settings.SMTP_HOST)
    stripe = StripeClient(settings.STRIPE_SECRET_KEY)
    
    # Repositories
    order_repo = MySQLOrderRepository(db_pool)
    user_repo = MySQLUserRepository(db_pool)
    
    # Services
    payment_service = PaymentService(StripeGateway(stripe))
    mailer = SMTPMailer(smtp)
    order_service = OrderService(order_repo, mailer, payment_service)
    user_service = UserService(user_repo, mailer)
    
    # HTTP handlers
    app = FastAPI()
    app.include_router(OrderRouter(order_service).router)
    app.include_router(UserRouter(user_service).router)
    
    return app
```

**Pure DI is often the right choice** for Python applications — no magic, no reflection, fully readable dependency graph.

### Container-based DI (Python — `dependency-injector`)

```python
from dependency_injector import containers, providers

class Container(containers.DeclarativeContainer):
    config = providers.Configuration()
    
    # Infrastructure
    db_pool = providers.Singleton(
        create_db_pool,
        url=config.database.url,
    )
    
    smtp = providers.Singleton(
        create_smtp_client,
        host=config.smtp.host,
    )
    
    # Repositories
    order_repo = providers.Factory(
        MySQLOrderRepository,
        pool=db_pool,
    )
    
    # Services
    mailer = providers.Factory(SMTPMailer, client=smtp)
    
    order_service = providers.Factory(
        OrderService,
        repo=order_repo,
        mailer=mailer,
        payment=providers.Factory(StripeGateway, api_key=config.stripe.key),
    )

# Usage
container = Container()
container.config.from_yaml('config.yaml')

@app.get("/orders/{order_id}")
def get_order(
    order_id: str,
    service: OrderService = Depends(container.order_service),
):
    return service.find(order_id)
```

### Container-based DI (Java Spring)

```java
// Spring: constructor injection with @Autowired
@Service
public class OrderService {
    private final OrderRepository repo;
    private final Mailer mailer;
    private final PaymentGateway payment;
    
    // Spring injects these automatically at startup
    @Autowired
    public OrderService(OrderRepository repo, Mailer mailer, PaymentGateway payment) {
        this.repo = repo;
        this.mailer = mailer;
        this.payment = payment;
    }
}

@Repository
public class MySQLOrderRepository implements OrderRepository { ... }

@Component
public class SMTPMailer implements Mailer { ... }
```

### Container-based DI (.NET)

```csharp
// Program.cs — composition root
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddScoped<IOrderRepository, MySQLOrderRepository>();
builder.Services.AddScoped<IMailer, SMTPMailer>();
builder.Services.AddScoped<IPaymentGateway, StripeGateway>();
builder.Services.AddScoped<OrderService>();  // container resolves its dependencies

var app = builder.Build();
```

---

## Service Locator — an anti-pattern

Service Locator is an alternative IoC approach where code asks a global registry for its dependencies. **Avoid it.**

```python
# Service Locator — looks like DI, but isn't
class ServiceLocator:
    _registry: dict = {}
    
    @classmethod
    def register(cls, name: str, instance): cls._registry[name] = instance
    
    @classmethod
    def get(cls, name: str): return cls._registry[name]

class OrderService:
    def place_order(self, order):
        # Hidden dependency — not visible in constructor
        repo = ServiceLocator.get('order_repo')   # ← problem
        mailer = ServiceLocator.get('mailer')     # ← problem
        repo.save(order)
        mailer.send(order.user.email, "Confirmed")
```

**Why Service Locator is an anti-pattern:**

| Problem | Impact |
|---|---|
| Hidden dependencies | You can't tell what `OrderService` needs from its signature |
| Testing requires the locator | Tests must set up the locator before calling anything |
| Hard to replace | "What depends on `order_repo`?" requires global search |
| Runtime failures | Missing registrations blow up at call time, not at startup |

With constructor injection, missing dependencies fail at startup (or at test creation) — not in production at the worst possible moment.

---

## Scopes: Singleton, Transient, Scoped

DI containers manage object lifetimes:

```
Singleton  → one instance for the entire application lifetime
             Use for: stateless services, caches, DB connection pools
             Risk: shared mutable state causes bugs in concurrent code

Transient  → new instance every time it's requested
             Use for: lightweight, stateful objects that shouldn't be shared
             Risk: creating expensive objects repeatedly

Scoped     → one instance per logical scope (e.g., per HTTP request)
             Use for: unit-of-work, DB sessions, request context
             Risk: accidentally extending scope (capturing in singleton)
```

```python
# Scope mismatch — common bug
class OrderService:  # Singleton
    def __init__(self, db_session: DBSession):  # Scoped (per-request)
        self.db_session = db_session  # WRONG: singleton captures scoped dep
        # All requests share the same DB session → data corruption
```

```
Rule of thumb:
  Singleton can depend on Singleton
  Scoped can depend on Singleton or Scoped
  Transient can depend on anything
  Singleton must NOT depend on Scoped or Transient
```

---

## Circular dependencies

DI forces circular dependencies into the open — a good thing, because they indicate a design problem.

```python
# Circular: A needs B, B needs A
class OrderService:
    def __init__(self, notification: NotificationService): ...

class NotificationService:
    def __init__(self, orders: OrderService): ...   # circular!
```

**Solutions:**
1. **Extract the shared dependency** — usually both A and B need some third thing C
2. **Use an event bus** — A publishes an event, B subscribes (no direct dependency)
3. **Lazy injection** — inject a factory/provider instead of the instance
4. **Setter injection** for one direction (last resort)

```python
# Resolution: NotificationService depends on abstraction, not OrderService directly
class OrderEventPublisher(ABC):
    def publish(self, event: OrderEvent): ...

class OrderService:
    def __init__(self, event_pub: OrderEventPublisher): ...  # no circular dep

class NotificationService(OrderEventPublisher):
    def publish(self, event: OrderEvent):
        # send notification based on the event
```

---

## Testing with DI

DI makes unit testing trivial — swap real infrastructure with fakes:

```python
# Fake implementations for tests — in-memory, no I/O
class InMemoryOrderRepository:
    def __init__(self):
        self._store: dict[str, Order] = {}
    
    def save(self, order: Order): self._store[order.id] = order
    def find_by_id(self, id: str) -> Order: return self._store.get(id)

class FakeMailer:
    def __init__(self): self.sent: list[dict] = []
    def send(self, to: str, message: str): self.sent.append({'to': to, 'body': message})

class FakePaymentGateway:
    def __init__(self, should_fail=False): self.should_fail = should_fail
    def charge(self, amount: float):
        if self.should_fail: raise PaymentFailedError("Card declined")

# Test: clean, fast, no I/O
def test_place_order_sends_confirmation_email():
    repo = InMemoryOrderRepository()
    mailer = FakeMailer()
    payment = FakePaymentGateway()
    service = OrderService(repo, mailer, payment)
    
    order = Order(user_email='alice@example.com', total=99.99)
    service.place_order(order)
    
    assert len(mailer.sent) == 1
    assert mailer.sent[0]['to'] == 'alice@example.com'

def test_place_order_rolls_back_on_payment_failure():
    repo = InMemoryOrderRepository()
    payment = FakePaymentGateway(should_fail=True)
    service = OrderService(repo, FakeMailer(), payment)
    
    with pytest.raises(PaymentFailedError):
        service.place_order(Order(total=99.99))
    
    assert len(repo._store) == 0  # not saved
```

---

## Summary

```
IoC              — broad principle: invert who controls dependencies
DI               — concrete technique: inject deps from outside
Constructor DI   — preferred: explicit, immutable, testable
Setter DI        — for optional deps or circular resolution
Interface DI     — rare, framework-specific
Pure DI          — manual wiring at composition root (often best for Python)
DI Container     — automates wiring (Spring, .NET, dependency-injector)
Service Locator  — anti-pattern: hidden deps, runtime failures
```

---

## Interview talking points

!!! tip "Key things to say"
    1. DI and IoC are different: IoC is the principle, DI is one implementation of it
    2. Constructor injection preferred — makes dependencies explicit and objects always valid
    3. Service Locator is an anti-pattern — hides dependencies, makes testing painful
    4. Scope mismatches are a common production bug: singleton capturing scoped/transient
    5. Pure DI (no container) is often fine — don't reach for Spring/containers by default

## Related topics

- [SOLID Principles](solid.md) — DIP is the principle that DI implements
- [Design Patterns](design-patterns.md) — Factory, Strategy often used with DI
- [Clean Architecture](clean-architecture.md) — DIP at architectural scale; composition root placement
