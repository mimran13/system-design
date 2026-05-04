# Testing Strategies

## The testing pyramid

The testing pyramid describes the ideal mix of test types: many fast unit tests at the base, fewer integration tests in the middle, and a small number of slow E2E tests at the top.

```
           /\
          /  \
         / E2E\          Few — slow, brittle, expensive
        /──────\
       /        \
      /Integration\      Some — medium speed, test contracts
     /────────────\
    /              \
   /   Unit Tests   \    Many — fast, isolated, cheap
  /──────────────────\
```

```
Guideline:
  Unit:        70% of tests
  Integration: 20% of tests
  E2E:         10% of tests

Cost comparison (rough):
  Unit test:        runs in milliseconds, isolated, never flaky
  Integration test: runs in seconds, needs real DB/queue
  E2E test:         runs in minutes, needs full deployed stack, often flaky
```

The pyramid exists because fast feedback loops matter. A suite of 10,000 unit tests that runs in 30 seconds is more valuable than 500 E2E tests that take 45 minutes — even if each E2E test covers more code.

---

## Unit tests

A unit test tests a single unit of behaviour in isolation. External dependencies (DB, HTTP, filesystem) are replaced with test doubles.

```python
# What makes a good unit test:
# 1. Tests one behaviour (not one function)
# 2. Reads like a spec (Arrange → Act → Assert)
# 3. Completely isolated — no I/O, no network, no shared state
# 4. Deterministic — same result every time

from decimal import Decimal
import pytest

class Money:
    def __init__(self, amount: Decimal, currency: str):
        if amount < 0:
            raise ValueError("Amount cannot be negative")
        self.amount = amount
        self.currency = currency
    
    def add(self, other: 'Money') -> 'Money':
        if self.currency != other.currency:
            raise ValueError(f"Cannot add {self.currency} and {other.currency}")
        return Money(self.amount + other.amount, self.currency)


# Arrange → Act → Assert pattern
class TestMoney:
    def test_add_same_currency(self):
        # Arrange
        five_dollars = Money(Decimal("5.00"), "USD")
        three_dollars = Money(Decimal("3.00"), "USD")
        
        # Act
        result = five_dollars.add(three_dollars)
        
        # Assert
        assert result.amount == Decimal("8.00")
        assert result.currency == "USD"
    
    def test_add_different_currencies_raises(self):
        dollars = Money(Decimal("5.00"), "USD")
        euros = Money(Decimal("3.00"), "EUR")
        
        with pytest.raises(ValueError, match="Cannot add"):
            dollars.add(euros)
    
    def test_negative_amount_raises(self):
        with pytest.raises(ValueError, match="cannot be negative"):
            Money(Decimal("-1.00"), "USD")
```

### What to unit test

```
✓ Business logic (calculations, validation, state transitions)
✓ Domain rules ("an order cannot be cancelled after it's shipped")
✓ Edge cases (empty input, zero, negative, overflow)
✓ Error conditions (what exceptions get raised and when)

✗ Framework code (your ORM, your HTTP library)
✗ Simple getters/setters with no logic
✗ Code that's just wiring (dependency injection setup)
✗ Private implementation details (test behaviour, not implementation)
```

---

## Test doubles

Test doubles replace real dependencies in unit tests. The terms are often used interchangeably but have precise meanings:

```python
from unittest.mock import Mock, MagicMock, patch
from abc import ABC, abstractmethod

class EmailService(ABC):
    @abstractmethod
    def send(self, to: str, subject: str, body: str) -> bool: ...

class OrderRepository(ABC):
    @abstractmethod
    def save(self, order) -> None: ...
    
    @abstractmethod
    def find_by_id(self, order_id: str): ...


# ── Stub ────────────────────────────────────────────────────────────
# Returns canned data. Used when the test needs a dependency to return
# a specific value. Doesn't track calls.
class StubOrderRepository(OrderRepository):
    def save(self, order): pass
    
    def find_by_id(self, order_id):
        return {'id': order_id, 'status': 'pending', 'total': 100.00}


# ── Fake ────────────────────────────────────────────────────────────
# A working implementation, simplified. Has real behaviour but avoids
# production infrastructure (e.g., in-memory DB instead of PostgreSQL).
class InMemoryOrderRepository(OrderRepository):
    def __init__(self):
        self._store: dict = {}
    
    def save(self, order):
        self._store[order.id] = order
    
    def find_by_id(self, order_id):
        return self._store.get(order_id)


# ── Mock ────────────────────────────────────────────────────────────
# Verifies interactions — did the code call the dependency correctly?
# Used when the side effect (calling the dependency) is what you're testing.
class TestOrderService:
    def test_places_order_sends_confirmation_email(self):
        # Arrange
        mock_email = Mock(spec=EmailService)
        mock_email.send.return_value = True
        
        repo = InMemoryOrderRepository()
        service = OrderService(repo, mock_email)
        
        # Act
        service.place_order(user_id='u1', items=[{'sku': 'p1', 'qty': 1}])
        
        # Assert — verify the interaction happened
        mock_email.send.assert_called_once()
        call_args = mock_email.send.call_args
        assert 'u1' in str(call_args)
    
    def test_saves_order_to_repository(self):
        # Use Fake (in-memory) — we care about what was saved, not the DB
        repo = InMemoryOrderRepository()
        email = Mock(spec=EmailService)
        service = OrderService(repo, email)
        
        order_id = service.place_order(user_id='u1', items=[])
        
        saved = repo.find_by_id(order_id)
        assert saved is not None
        assert saved.status == 'pending'
```

| Double | Has behaviour? | Verifies calls? | Use when |
|---|---|---|---|
| **Dummy** | No | No | Fill parameter that isn't used in this test |
| **Stub** | Minimal (returns canned data) | No | Test needs dependency to return specific value |
| **Fake** | Yes (simplified real behaviour) | No | Need working implementation without infrastructure |
| **Spy** | Yes | Yes (records calls, you assert later) | Verify interactions without strict expectations |
| **Mock** | Configured per test | Yes (strict expectations) | Verify specific interactions, fail if not met |

---

## Integration tests

Integration tests verify that components work together correctly — typically involving real infrastructure (database, message queue, HTTP server).

```python
import pytest
import psycopg2

# Use pytest fixtures for test DB setup
@pytest.fixture(scope='function')
def test_db():
    """
    Spin up a real (test) database for each test.
    In CI: use Docker (testcontainers).
    Locally: use a dedicated test schema.
    """
    conn = psycopg2.connect("postgresql://localhost/test_db")
    
    # Start with clean slate
    with conn.cursor() as cur:
        cur.execute("BEGIN")
        yield conn
        # Rollback after each test — next test starts clean
        cur.execute("ROLLBACK")
    
    conn.close()

class TestOrderRepository:
    def test_saves_and_retrieves_order(self, test_db):
        repo = PostgresOrderRepository(test_db)
        
        order = Order(id='ord-1', user_id='u-1', status='pending')
        repo.save(order)
        
        retrieved = repo.find_by_id('ord-1')
        
        assert retrieved.id == 'ord-1'
        assert retrieved.user_id == 'u-1'
        assert retrieved.status == 'pending'
    
    def test_find_by_user_returns_all_orders(self, test_db):
        repo = PostgresOrderRepository(test_db)
        
        repo.save(Order(id='ord-1', user_id='u-1', status='pending'))
        repo.save(Order(id='ord-2', user_id='u-1', status='shipped'))
        repo.save(Order(id='ord-3', user_id='u-2', status='pending'))
        
        user_orders = repo.find_by_user('u-1')
        
        assert len(user_orders) == 2
        assert all(o.user_id == 'u-1' for o in user_orders)
```

### Testcontainers — real infrastructure in CI

```python
# pip install testcontainers
from testcontainers.postgres import PostgresContainer
from testcontainers.kafka import KafkaContainer

@pytest.fixture(scope='session')
def postgres_container():
    with PostgresContainer("postgres:16") as postgres:
        yield postgres.get_connection_url()

@pytest.fixture(scope='session')
def kafka_container():
    with KafkaContainer() as kafka:
        yield kafka.get_bootstrap_server()

# These spin up real Docker containers for your tests.
# Much better than mocking — tests catch real DB behaviour
# (index violations, constraint errors, transaction semantics).
```

---

## Contract testing (Consumer-Driven Contracts)

In microservices, services communicate via APIs. Contract tests verify that:
- The **consumer** (caller) gets what it expects
- The **provider** (API owner) doesn't break consumers when it changes

This sits between unit and integration tests — faster than full E2E, but catches API compatibility breaks.

```
Traditional approach (breaks in production):
  Team A owns Order Service (consumer)
  Team B owns Inventory Service (provider)
  
  Team B changes the response schema:
    { "available": true }  →  { "in_stock": true }
  
  Team B's tests pass. Team A's tests pass.
  Deploy to production → Order Service crashes.

Contract testing (catches this before deploy):
  Consumer (Order Service) defines a "contract":
    "I call GET /inventory/{sku} and expect: { available: boolean }"
  
  Provider (Inventory Service) runs the contract as a test suite.
  When Team B renames "available" → "in_stock":
    → Contract test fails on Inventory Service
    → Team B knows they broke a consumer before deploying
```

```python
# Using Pact (the de-facto contract testing framework)
# pip install pact-python

from pact import Consumer, Provider

# ── Consumer side (Order Service team writes this) ──────────────────
pact = Consumer('OrderService').has_pact_with(Provider('InventoryService'))

def test_get_inventory_for_sku():
    # Define what we expect the provider to return
    (pact
     .given('SKU "widget-1" has 50 units available')
     .upon_receiving('a request for inventory of widget-1')
     .with_request('GET', '/inventory/widget-1')
     .will_respond_with(200, body={
         'sku': 'widget-1',
         'available': True,
         'quantity': 50,
     }))
    
    with pact:
        # Run the actual consumer code against the mock provider
        result = inventory_client.get_inventory('widget-1')
        assert result.available is True
    
    # Pact saves a "pact file" (contract) to share with provider


# ── Provider side (Inventory Service team runs this) ────────────────
# Provider tests load pact file and replay interactions against real service
# If provider response doesn't match contract → test fails → deployment blocked
```

### When to use contract testing

```
✓ Service-to-service HTTP APIs in microservices
✓ Published APIs consumed by external teams
✓ When you want to decouple consumer and provider test suites
✓ In CI: provider can't deploy if any consumer contract breaks

✗ Internal function calls (use unit tests)
✗ UI-to-backend (use E2E for critical flows)
✗ Third-party APIs you don't control (mock them, don't contract test)
```

---

## End-to-end tests

E2E tests drive the entire system through its real interfaces (usually a browser or API) and verify complete user flows.

```python
# Using pytest + httpx for API-level E2E (faster than browser)
import httpx
import pytest

BASE_URL = "https://api.staging.myapp.com"

@pytest.mark.e2e
class TestPlaceOrderFlow:
    def test_complete_purchase_flow(self, auth_token):
        client = httpx.Client(
            base_url=BASE_URL,
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        # Step 1: Add item to cart
        resp = client.post("/cart/items", json={"sku": "widget-1", "qty": 2})
        assert resp.status_code == 200
        cart_id = resp.json()["cart_id"]
        
        # Step 2: Place order
        resp = client.post("/orders", json={
            "cart_id": cart_id,
            "shipping_address": {"line1": "123 Main St", "city": "NYC"},
            "payment_method_id": "pm_test_visa",
        })
        assert resp.status_code == 201
        order_id = resp.json()["order_id"]
        
        # Step 3: Verify order is in expected state
        resp = client.get(f"/orders/{order_id}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "confirmed"
        assert resp.json()["total"] > 0
```

### E2E test rules

```
✓ Test the most critical user journeys only (happy path + most important error cases)
✓ Run against a real deployed environment (staging, not mocks)
✓ Use stable test data / test accounts (not production data)
✓ Tag as @e2e or @slow so developers can skip them locally

✗ Don't use E2E tests for edge cases (unit tests are better for that)
✗ Don't have more than ~50 E2E tests total — they're expensive to maintain
✗ Don't run E2E on every commit — run on PR merge or nightly
```

---

## Testing in microservices

Microservices create specific testing challenges:

```
Challenges:
  1. Integration tests need multiple services running
  2. Hard to test distributed failure scenarios
  3. Consumer-provider coupling across team boundaries
  4. Test environment parity (mocks diverge from real behaviour)

Strategy:
  Unit tests:      Test each service's business logic in isolation
  Contract tests:  Verify service API contracts (replaces most integration tests)
  Component tests: Test one service end-to-end in isolation (Docker compose)
  E2E tests:       Test critical cross-service flows in staging (few, slow)
```

```
Test strategy per layer:

Service internals (domain logic):
  → Unit tests, test doubles for all I/O
  
Service HTTP/event API:
  → Component tests: full service in Docker, real DB, real queue
  → Contract tests: verify API contracts for other team's consumers
  
Cross-service flows:
  → E2E tests: 10-20 critical journeys in a staging environment
  
Infrastructure (K8s, load balancer):
  → Smoke tests after deployment: ping health endpoints
```

---

## Property-based testing

Instead of writing specific input/output examples, you define properties that must hold for all inputs. The framework generates hundreds of random test cases.

```python
# pip install hypothesis
from hypothesis import given, strategies as st
from hypothesis import settings

@given(
    amount=st.decimals(min_value='0.01', max_value='1000000', places=2),
    currency=st.sampled_from(['USD', 'EUR', 'GBP']),
)
def test_money_roundtrip(amount, currency):
    """Money serialized to dict and back should be identical."""
    m = Money(amount, currency)
    serialized = m.to_dict()
    restored = Money.from_dict(serialized)
    assert restored.amount == m.amount
    assert restored.currency == m.currency

@given(
    a=st.decimals(min_value='0', max_value='500', places=2),
    b=st.decimals(min_value='0', max_value='500', places=2),
)
def test_money_addition_is_commutative(a, b):
    """a + b should equal b + a."""
    m_a = Money(a, 'USD')
    m_b = Money(b, 'USD')
    assert m_a.add(m_b).amount == m_b.add(m_a).amount
```

Property-based testing is especially powerful for:
- Data serialization/deserialization
- Math properties (commutativity, associativity)
- State machine invariants
- Encoding/decoding round trips

---

## What NOT to test

Testing everything is as bad as testing nothing:

```
Don't test:
  ✗ Third-party libraries (trust them, they have their own tests)
  ✗ Framework internals (your ORM's SQL generation)
  ✗ Simple getters/setters with no logic
  ✗ Private methods directly (test them through the public API)
  ✗ Configuration files
  ✗ Code generated by tools

Signs your tests are too coupled to implementation:
  → Tests break when you refactor without changing behaviour
  → Tests assert on internal state, not observable outputs
  → Every method has exactly one test
  → Tests are harder to read than the code they test
```

---

## Test coverage

Coverage measures which lines/branches are exercised by tests. It's a useful floor, not a ceiling:

```
Line coverage 80%: fine as a minimum gate
Line coverage 100%: often counterproductive (tests trivial code to hit number)

What coverage doesn't tell you:
  ✗ Whether the tests are meaningful (can assert wrong thing)
  ✗ Whether edge cases are tested (covered line ≠ tested all inputs)
  ✗ Whether the most important behaviour is tested

What to actually measure:
  → Mutation testing (Mutmut, PITest): artificially introduce bugs,
    check if tests catch them. More meaningful than line coverage.
  → Branch coverage: are both true/false paths of every if tested?
```

---

## Interview talking points

!!! tip "Key things to say"
    1. The testing pyramid: many unit tests (fast, isolated, cheap), some integration tests (real infrastructure), few E2E tests (slow, test complete flows). The ratio is typically 70/20/10
    2. Test behaviour, not implementation — tests should survive refactoring. If renaming a private method breaks tests, the tests are testing the wrong thing
    3. In microservices, contract testing (Pact) sits between unit and E2E — consumers define what they expect from providers, providers run those contracts as tests. Catches API breaks before deployment
    4. Fakes over mocks where possible — an in-memory repository that actually stores and retrieves data is more valuable than a mock that just records calls. Tests with real behaviour catch more bugs
    5. Testcontainers for integration tests — spin up real PostgreSQL/Kafka in Docker for tests. Much better than mocking infrastructure — catches constraint violations, transaction semantics, schema mismatches that mocks miss
    6. Don't test the unhappy path through E2E — use unit tests for edge cases and error handling (fast), use E2E only for the critical happy path flows

## Related topics

- [Clean Architecture](clean-architecture.md) — architecture that enables easy testing (dependency inversion makes faking trivial)
- [IoC & Dependency Injection](ioc-di.md) — DI is what makes swapping real dependencies for test doubles possible
- [Hexagonal Architecture](../architecture/hexagonal.md) — ports and adapters = the seams where you insert test doubles
- [Saga Pattern](../patterns/saga-pattern.md) — testing distributed sagas (choreography vs orchestration testability)
