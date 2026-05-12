# Microservices Patterns

The [Monolith vs Microservices](monolith-vs-microservices.md) page covers the strategic decision. This page covers the **tactical patterns** — how you actually build a microservices system once you've decided to go that route.

---

## You'll see this when...

- Team grew past ~50 engineers; one codebase doesn't scale organisationally
- Different services need different scaling characteristics (one needs 1000 instances, one needs 5)
- Polyglot stack (Python ML service + Go API + Java legacy)
- Service mesh (Istio, Linkerd), API gateway, service discovery in the stack
- "Database per service" debates / multiple DBs serving one product
- Sidecars, circuit breakers, distributed tracing already deployed
- Independent deploy cadence is a real business need (multiple teams shipping daily)
- Existing microservices system that needs better patterns to manage complexity

---

## Cost reality

Going microservices is rarely cheaper than a monolith. Concrete order-of-magnitude (AWS, 2026):

```
Modular monolith (~5 services-worth of work in one deploy):
  Compute:           $200-2K/month (1 service, multi-AZ)
  Database:          $200-1K
  Observability:     $100-500
  CI/CD:             essentially free
  Engineer ops time: ~10% of one engineer
  ────────────────────────────────────
  Total:             $500-3.5K/month + 0.1 FTE

Microservices (10 services):
  Compute:           $2K-10K/month (10 deployments, redundancy)
  Databases:         $1K-5K (often per-service)
  Service mesh:      $300-1K (Istio control plane, sidecars)
  Observability:     $500-3K (more telemetry, distributed tracing)
  API gateway:       $200-500
  CI/CD:             10 pipelines × $0 base (more runner minutes)
  Engineer ops time: ~30-50% of one engineer (dedicated)
  ────────────────────────────────────
  Total:             $4K-20K/month + 0.3-0.5 FTE

Microservices (30+ services, larger team):
  Compute:           $10K-50K/month
  Databases:         $5K-20K
  Service mesh + observability + API gateway: $2K-10K
  Engineer ops time: 1-3 FTE (platform team)
  ────────────────────────────────────
  Total:             $20K-100K/month + 1-3 FTE
```

The platform-team cost (humans operating it) usually outweighs the infrastructure cost. Plan for both.

---

## Service decomposition

The hardest question in microservices is where to draw the service boundary. Two strategies:

### By business capability

Each service owns one business capability that the organisation recognises as a domain.

```
E-commerce platform capabilities:
  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
  │  Order Service  │  │ Catalog Service  │  │ Payment Service │
  │                 │  │                 │  │                 │
  │ Place order     │  │ Browse products  │  │ Charge cards    │
  │ Track order     │  │ Search           │  │ Issue refunds   │
  │ Cancel order    │  │ Manage inventory │  │ View history    │
  └─────────────────┘  └─────────────────┘  └─────────────────┘
  
  ┌─────────────────┐  ┌─────────────────┐
  │  User Service   │  │ Shipping Service │
  │                 │  │                 │
  │ Registration    │  │ Calculate rates  │
  │ Login           │  │ Track packages   │
  │ Profile         │  │ Notify on update │
  └─────────────────┘  └─────────────────┘
```

### By subdomain (DDD approach)

Use [Domain-Driven Design](ddd.md) bounded contexts as service boundaries. Each bounded context maps to one service (or a small cluster).

```
Signs you have the boundary wrong:

Too fine-grained ("nano-services"):
  Request to place an order makes 15 service calls
  → Chatty, high latency, hard to trace
  → Merge related services

Too coarse-grained:
  One "core service" handles orders, payments, and shipping
  → Different change rates, different team ownership, deployment coupling
  → Split along business capability lines

Right size:
  A service can be understood by one team (2-pizza rule)
  A service can be deployed and scaled independently
  A service has one clear reason to change
```

---

## Inter-service communication

Services talk to each other in two fundamental ways:

```
Synchronous (request-response):
  Caller waits for response before continuing
  Use when: caller needs the answer NOW to proceed

Asynchronous (event-driven):
  Caller fires and forgets; response comes later (or never)
  Use when: caller doesn't need the answer immediately

Choosing:
  "Does the caller need the response to complete its own response?"
  → Yes: synchronous
  → No: asynchronous
```

### Synchronous: REST and gRPC

```python
# REST (HTTP/JSON) — universal, human-readable, slightly verbose
# gRPC (HTTP/2 + Protobuf) — faster, typed, better for internal service-to-service

# Inventory Service client (used by Order Service)
import httpx

class InventoryClient:
    def __init__(self, base_url: str):
        self.client = httpx.Client(
            base_url=base_url,
            timeout=httpx.Timeout(connect=1.0, read=5.0),  # always set timeouts
        )
    
    def check_availability(self, sku: str, quantity: int) -> bool:
        try:
            resp = self.client.get(
                f"/inventory/{sku}",
                params={"quantity": quantity},
            )
            resp.raise_for_status()
            return resp.json()["available"]
        except httpx.TimeoutException:
            # Don't let Inventory slowness fail the Order — fallback
            raise InventoryUnavailableError("Inventory service timed out")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return False  # SKU not found = not available
            raise
```

### Asynchronous: events via Kafka

```python
# Order Service publishes an event; downstream services react
import json
from kafka import KafkaProducer, KafkaConsumer

class OrderService:
    def __init__(self, db, producer: KafkaProducer):
        self.db = db
        self.producer = producer
    
    def place_order(self, user_id: str, items: list) -> str:
        order_id = create_order_in_db(self.db, user_id, items)
        
        # Fire and forget — don't wait for inventory/payment/notification to complete
        self.producer.send('order-placed', value={
            'order_id': order_id,
            'user_id': user_id,
            'items': items,
            'placed_at': datetime.utcnow().isoformat(),
        })
        
        return order_id  # Return immediately, async processing happens separately


# Inventory Service reacts to the event
class InventoryConsumer:
    def __init__(self):
        self.consumer = KafkaConsumer('order-placed', group_id='inventory-service')
    
    def run(self):
        for message in self.consumer:
            event = json.loads(message.value)
            self.reserve_inventory(event['order_id'], event['items'])
```

---

## Database per service

Each microservice owns its own database. No service accesses another service's database directly.

```
Wrong (shared database):
  Order Service  ──┐
  Payment Service──┼──► Single shared PostgreSQL
  Shipping Service─┘
  
  Problems:
  - Schema changes need coordination across all services
  - One service's bad query can starve others
  - Can't scale databases independently
  - Coupling through shared schema

Right (database per service):
  Order Service  ──► Orders PostgreSQL
  Payment Service──► Payments PostgreSQL  
  Shipping Service─► Shipping DynamoDB (different DB choice!)
  
  Each team chooses the right database for their access patterns.
  Each database scales independently.
  Schema changes are internal — no coordination needed.
```

### The cross-service query problem

With separate databases, you can't JOIN across services. Common solutions:

```python
# Problem: "Show me all orders with user details and payment status"
# Can't join orders DB + users DB + payments DB in one query

# Solution 1: API Composition
# Call each service, join in the application layer
class OrderDetailsComposer:
    def get_order_details(self, order_id: str) -> dict:
        # Parallel calls to avoid serial latency
        import asyncio
        
        async def fetch_all():
            order, payment, user = await asyncio.gather(
                self.order_client.get_order(order_id),
                self.payment_client.get_payment_for_order(order_id),
                self.user_client.get_user(order.user_id),
            )
            return {**order, 'payment': payment, 'user': user}
        
        return asyncio.run(fetch_all())

# Solution 2: CQRS with a Read Model
# Maintain a denormalized read model that joins the data
# Events from each service update the read model
# Dashboard queries the read model (no cross-service calls at read time)
class OrderReadModelUpdater:
    """Consumes events from all services, maintains joined read model."""
    
    def on_order_placed(self, event: dict):
        self.read_db.upsert('order_summaries', {
            'order_id': event['order_id'],
            'user_id': event['user_id'],
            'status': 'pending',
        })
    
    def on_payment_completed(self, event: dict):
        self.read_db.update('order_summaries',
            where={'order_id': event['order_id']},
            set={'payment_status': 'paid'},
        )
    
    def on_order_shipped(self, event: dict):
        self.read_db.update('order_summaries',
            where={'order_id': event['order_id']},
            set={'status': 'shipped', 'tracking': event['tracking_number']},
        )
```

---

## Sidecar pattern

Infrastructure concerns (logging, metrics, service discovery, mTLS) are extracted into a co-located proxy container rather than embedded in the service code.

```
Without sidecar:
  Every service must implement:
    - mTLS for service-to-service encryption
    - Retry logic
    - Circuit breaking
    - Distributed tracing headers
    - Service discovery
  
  This is thousands of lines of boilerplate per service.

With sidecar (Envoy/Istio):
  Service container: just business logic
  Sidecar container: handles all networking concerns
  
  ┌──────────────────────────────┐
  │            Pod               │
  │  ┌────────┐  ┌────────────┐  │
  │  │ Order  │  │   Envoy    │  │
  │  │Service │◄►│  Sidecar   │  │
  │  │  :8080 │  │    :15001  │  │
  │  └────────┘  └──────┬─────┘  │
  └─────────────────────┼────────┘
                        │ mTLS, retry, tracing
                        ▼
                  Inventory Pod
                  (another Envoy sidecar)
```

The collection of sidecars across all pods is the **service mesh** (Istio, Linkerd). See [Service Mesh](../infrastructure/service-mesh.md).

---

## Anti-Corruption Layer (ACL)

When integrating with an external system (legacy API, third-party service), the ACL translates between the external model and your internal domain model. Prevents the external model from "polluting" your domain.

```python
# External payment gateway uses its own terminology
# Your domain uses different terms

# Without ACL: external terms leak into your domain
class PaymentService:
    def charge(self, amount, currency):
        result = stripe.charges.create(
            amount=amount,
            currency=currency,
        )
        # Now "charge", "charge_id", "stripe_status" leak into your code
        return {'charge_id': result.id, 'stripe_status': result.status}

# With ACL: translation happens at the boundary
class StripePaymentGateway:
    """ACL: translates between Stripe's model and our domain."""
    
    def __init__(self, stripe_client):
        self._stripe = stripe_client
    
    # Speaks your domain language:
    def process_payment(self, transaction: 'PaymentTransaction') -> 'PaymentResult':
        # Translate domain → external
        stripe_charge = self._stripe.charges.create(
            amount=transaction.amount_cents,
            currency=transaction.currency.lower(),
            source=transaction.payment_method_token,
            idempotency_key=str(transaction.id),
        )
        
        # Translate external → domain
        return PaymentResult(
            transaction_id=transaction.id,
            status=self._map_status(stripe_charge.status),
            external_ref=stripe_charge.id,
        )
    
    def _map_status(self, stripe_status: str) -> 'PaymentStatus':
        mapping = {
            'succeeded': PaymentStatus.COMPLETED,
            'pending':   PaymentStatus.PENDING,
            'failed':    PaymentStatus.FAILED,
        }
        return mapping.get(stripe_status, PaymentStatus.UNKNOWN)

# Your domain only knows PaymentResult — never touches Stripe models directly
```

---

## Service discovery

Services need to find each other. In containerized environments, IPs change constantly — you need dynamic discovery.

```
Client-side discovery:
  Service A queries service registry (Consul, Eureka) directly
  Gets list of healthy instances of Service B
  Load balances itself (e.g., round-robin)
  
  Pros: no extra hop, client controls routing logic
  Cons: every language needs a discovery client library

Server-side discovery:
  Service A calls Service B via a fixed address (load balancer / k8s Service)
  Load balancer queries registry and routes request
  
  Pros: client is simple, works with any language
  Cons: extra hop (load balancer), more infrastructure

Kubernetes approach (server-side, DNS-based):
  Service B registered as a Kubernetes Service: "inventory-service"
  Service A calls: http://inventory-service:8080/...
  kube-dns resolves "inventory-service" to the ClusterIP
  kube-proxy load-balances across healthy pods
  
  Service A doesn't need any discovery library — just HTTP to a stable hostname.
```

---

## Health checks and graceful shutdown

Services must report their own health so traffic isn't routed to unhealthy instances:

```python
from fastapi import FastAPI
import asyncio

app = FastAPI()

@app.get("/health/live")
async def liveness():
    """
    Liveness probe: is the process alive?
    Return 200 unless the process is fundamentally broken.
    If this fails, Kubernetes RESTARTS the container.
    """
    return {"status": "alive"}

@app.get("/health/ready")
async def readiness():
    """
    Readiness probe: is the service ready to receive traffic?
    Check dependencies (DB, cache). If this fails, Kubernetes
    REMOVES the pod from load balancer rotation (no restart).
    """
    try:
        await db.ping()             # Can we reach the database?
        await redis_client.ping()   # Can we reach the cache?
        return {"status": "ready"}
    except Exception as e:
        return Response(
            content=f'{{"status":"not_ready","reason":"{str(e)}"}}',
            status_code=503,
        )

# Graceful shutdown: finish in-flight requests before dying
import signal

@app.on_event("shutdown")
async def shutdown():
    """
    On SIGTERM: stop accepting new requests, finish current ones.
    Kubernetes sends SIGTERM before force-killing (after terminationGracePeriodSeconds).
    """
    # Close connections cleanly
    await db.close()
    await kafka_producer.flush()  # Don't lose buffered messages
    await kafka_producer.close()
```

---

## Distributed tracing across services

Without tracing, debugging a request that spans 5 services is nearly impossible:

```python
# Every service propagates trace context via HTTP headers
# OpenTelemetry is the standard

from opentelemetry import trace
from opentelemetry.propagate import inject, extract
import httpx

tracer = trace.get_tracer(__name__)

class InventoryClient:
    def check_availability(self, sku: str, request_headers: dict) -> bool:
        # Extract incoming trace context (from the calling service)
        ctx = extract(request_headers)
        
        with tracer.start_as_current_span(
            "inventory.check_availability",
            context=ctx,
        ) as span:
            span.set_attribute("inventory.sku", sku)
            
            # Inject trace context into outgoing request headers
            headers = {}
            inject(headers)  # adds traceparent, tracestate headers
            
            resp = httpx.get(
                f"http://inventory-service/inventory/{sku}",
                headers=headers,
            )
            
            span.set_attribute("inventory.available", resp.json()["available"])
            return resp.json()["available"]

# Result: Jaeger/Zipkin shows the full trace:
# Order Service → Inventory Service → DB
# With timing, errors, and attributes at each step
```

---

## Common anti-patterns

```
Distributed monolith:
  Services that must be deployed together (shared DB, tight coupling)
  All the operational complexity of microservices with none of the benefits
  Fix: enforce database-per-service, decouple via events

Chatty services:
  Order Service makes 20 API calls to place one order
  Network latency multiplies. One slow service = slow everything.
  Fix: merge fine-grained services, or switch to async events

Shared database between services:
  "We'll just share the users table — it's simple"
  → Schema ownership is unclear → both teams update → conflicts
  Fix: Service A owns the data, Service B calls Service A's API

Synchronous call chains:
  Order → Payment → Fraud → Risk → Compliance → (all sync)
  One slow or failed service = request fails
  Fix: use async events for non-blocking steps; only sync what you need NOW

Wrong service boundaries:
  Service boundaries don't match team boundaries
  → Cross-team coordination required for every feature
  Fix: Conway's Law — align services to team ownership
  "Any organization that designs a system will produce a design
   whose structure is a copy of the organization's communication structure"
```

---

## Decision checklist: do you need microservices?

```
Good reasons:
  ✓ Multiple teams working on the same codebase with friction
  ✓ Different services have radically different scaling needs
  ✓ Different services need different technology stacks
  ✓ Independent deployment is required (different release cadences)
  ✓ You've already proven the domain model in a monolith

Bad reasons:
  ✗ "Microservices are modern / best practice"
  ✗ Your team is < 10 engineers
  ✗ You're in early-stage / pre-product-market-fit
  ✗ "It'll be easier to scale later"
  ✗ You don't have solid CI/CD, container infrastructure, and observability
     (microservices will destroy you operationally without these)

Default rule: start with a well-structured monolith. 
Split when you have concrete pain (deployment coupling, scaling bottleneck, team friction).
Premature decomposition is as costly as premature optimization.
```

---

## Interview talking points

!!! tip "Key things to say"
    1. **Service boundaries** — use DDD bounded contexts as the guide. The boundary is wrong if you need synchronous calls for 80% of operations (too fine-grained) or if multiple teams need to coordinate every change (too coarse-grained)
    2. **Database per service** — the non-negotiable rule. Shared databases create schema coupling that makes microservices worse than a monolith. Cross-service queries solved by API composition or CQRS read models
    3. **Async by default** — if the calling service doesn't need the answer to complete its response, use events (Kafka). This decouples failure domains — one service going down doesn't cascade
    4. **Sidecar pattern** — infrastructure concerns (mTLS, retries, tracing) belong in the sidecar (Envoy), not in service code. This is what a service mesh provides
    5. **Anti-Corruption Layer** — always translate at external system boundaries. Never let the external model (Stripe, legacy API) leak into your domain model
    6. **Start with a monolith** — microservices have real operational costs. Unless you have concrete reasons (team size, scaling, deployment independence), a well-structured monolith is cheaper to build and operate

## Related topics

- [Monolith vs Microservices](monolith-vs-microservices.md) — when to make the switch
- [Domain-Driven Design](ddd.md) — finding service boundaries with bounded contexts
- [Saga Pattern](../patterns/saga-pattern.md) — distributed transactions across services
- [CQRS](../patterns/cqrs.md) — solving cross-service query problems
- [Service Mesh](../infrastructure/service-mesh.md) — sidecar pattern at scale (Istio, Linkerd)
- [Event-Driven Architecture](event-driven.md) — async communication between services
- [Testing Strategies](../software-design/testing-strategies.md) — contract testing for service APIs
