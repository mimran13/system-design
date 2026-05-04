# Strangler Fig Pattern

## What it is

The Strangler Fig pattern is a migration strategy for incrementally replacing a legacy system (monolith) with a new system (microservices or a modernized architecture), by gradually routing traffic from the old system to new services until the old system is fully replaced and can be removed.

Named after the strangler fig tree — a vine that grows around a host tree, gradually replacing it while the host continues to function until eventually the host is gone and only the vine remains.

```
Phase 1 — Start: All traffic through legacy monolith
  Client → Facade → Monolith (handles everything)

Phase 2 — Middle: Facade routes some traffic to new services
  Client → Facade → Monolith (handles orders, users, ...)
                  → New Payment Service (handles /payment/*)
                  → New Inventory Service (handles /inventory/*)

Phase 3 — End: Monolith is replaced, facade removed or becomes gateway
  Client → API Gateway → Payment Service
                       → Inventory Service
                       → User Service
                       → ... (monolith gone)
```

The key insight: the old system keeps working throughout. You never do a "big bang" rewrite — that almost always fails.

---

## Why "big bang" rewrites fail

```
The big bang approach:
  Month 1-18: Freeze monolith, rewrite everything in parallel
  Month 18:   Deploy new system and switch over all at once

Reality:
  Month 18:   New system is missing edge cases discovered only in prod
              Data migration is incomplete
              Performance is worse than expected
              Team burned out
              Rollback is now impossible (data has diverged)
  
  Famous examples: Netscape, HealthCare.gov v1
```

The strangler fig avoids this by:
- Running old and new in parallel
- Migrating one capability at a time
- Each migration is small, testable, and reversible
- No single risky cutover moment

---

## The three steps (per capability)

For each piece of functionality you want to extract:

### Step 1: Add the Facade (Strangler Facade)

A proxy or API gateway sits in front of the monolith. Initially it forwards everything to the monolith. This is the starting point — it doesn't change behavior.

```python
# Strangler Facade: initially just a transparent proxy
class StranglerFacade:
    def __init__(self, monolith_url: str):
        self.monolith_url = monolith_url
    
    async def handle(self, request: Request) -> Response:
        # Phase 1: forward everything to monolith
        return await forward_to(self.monolith_url, request)
```

In practice, this is often an AWS ALB, API Gateway, Nginx, or Envoy proxy. No custom code needed for phase 1.

### Step 2: Build the new service, route traffic to it

Extract one capability into a new service. Route only the matching requests to it; everything else still goes to the monolith.

```python
# Strangler Facade: routing by path
class StranglerFacade:
    def __init__(self, monolith_url: str, payment_service_url: str):
        self.monolith_url = monolith_url
        self.payment_service_url = payment_service_url
    
    async def handle(self, request: Request) -> Response:
        # Route payment requests to new service
        if request.path.startswith('/api/payments'):
            return await forward_to(self.payment_service_url, request)
        
        # Everything else still goes to monolith
        return await forward_to(self.monolith_url, request)
```

With AWS API Gateway or ALB:
```yaml
# ALB Listener Rules
- condition: path-pattern /api/payments/*
  action: forward to new-payment-service-target-group

- condition: path-pattern *  (default)
  action: forward to legacy-monolith-target-group
```

### Step 3: Verify, then delete the monolith code

Once the new service handles the capability in production with sufficient confidence:
- Remove the corresponding code from the monolith
- Update the facade to permanently route to the new service
- Repeat for the next capability

```
Verification checklist before removing monolith code:
  □ New service has handled production traffic for 2+ weeks
  □ Error rates equal or better than monolith
  □ Latency equal or better
  □ All edge cases covered (compare request logs)
  □ Data is migrated or dual-written successfully
  □ Rollback plan exists and has been tested
```

---

## Data migration strategy

The hardest part isn't the code — it's the data. The monolith and new services share a database, which creates tight coupling.

### Approach 1: Shared database (interim)

During migration, the new service reads and writes the monolith's database directly. Easiest to implement but creates coupling.

```
New Payment Service ────┐
                        ├──► Monolith's PostgreSQL (shared)
Legacy Monolith     ────┘

Pros: No data migration needed, immediate consistency
Cons: Schema changes affect both, can't optimize independently
```

Use this as a temporary measure while you prepare the full migration.

### Approach 2: Dual write

New service writes to both the monolith's DB and its own DB. Read from new DB. Once confident, stop writing to monolith's DB.

```python
class PaymentService:
    async def process_payment(self, payment: Payment):
        # Write to own DB
        await self.payment_repo.save(payment)
        
        # Also write to legacy DB during transition
        await self.legacy_db.execute(
            "INSERT INTO payments (...) VALUES (...)", payment.to_legacy_format()
        )
        
        # Once legacy reads stop: remove the legacy write
```

### Approach 3: Event-driven sync

New service publishes events; a sync process updates the legacy DB (or vice versa). More decoupled but adds latency and complexity.

```
New Payment Service → publishes PaymentProcessed event
                           ↓
                    Legacy Sync Consumer → updates monolith DB
                    (keeping legacy in sync during migration)
```

### Approach 4: Change Data Capture (CDC)

Use Debezium or AWS DMS to stream DB changes from monolith to new service's DB. Zero application-level change needed.

```
Monolith PostgreSQL → Debezium → Kafka → New Service's DB
```

---

## Feature flag / traffic split strategy

Don't flip all traffic at once. Roll out gradually:

```python
class StranglerFacade:
    async def handle(self, request: Request) -> Response:
        if request.path.startswith('/api/payments'):
            
            # Phase 1: 5% to new service (canary)
            if hash(request.user_id) % 100 < 5:
                return await forward_to(self.payment_service, request)
            
            # Phase 2: 50% when confident
            # Phase 3: 100% then delete monolith code
            return await forward_to(self.monolith, request)
        
        return await forward_to(self.monolith, request)
```

Or use a feature flag service (LaunchDarkly, AWS AppConfig):

```python
if feature_flags.is_enabled('use_new_payment_service', user_id=request.user_id):
    return await self.payment_service.process(request)
return await self.monolith.process(request)
```

---

## Which capabilities to extract first

Not all capabilities are equal. The extraction order matters:

```
Extract first (low risk, high leverage):
  ✓ Capabilities with clear boundaries (payments, notifications)
  ✓ Capabilities with the most independent scaling needs
  ✓ Capabilities with the least shared state
  ✓ Capabilities with the most active development (teams moving fast)
  ✓ Non-critical features (can fail without bringing down everything)

Extract last (high risk, high coupling):
  ✗ Core user authentication (everything depends on it)
  ✗ Highly shared domain models (orders touched by 10 modules)
  ✗ Capabilities with complex data migrations
  ✗ The part of the monolith with the most spaghetti code
```

**Practical approach:** Extract by bounded context (DDD). Each bounded context should map to one or two services. Use domain analysis to find boundaries — where the ubiquitous language changes is usually a good seam.

---

## Pitfalls

### Distributed monolith

Extracted services that still share a database or call each other synchronously aren't microservices — they're a distributed monolith:

```
WRONG (distributed monolith):
  Payment Service → queries monolith's orders table directly
  Inventory Service → calls Payment Service synchronously

RIGHT:
  Payment Service → owns its data, communicates via events
  Inventory Service → owns its data, communicates via events
```

### Stopping halfway

The most common failure: the strangler fig gets 30% done and momentum stalls. The team ends up with a partial monolith + partial microservices — the worst of both worlds:

```
Result of stopping halfway:
  Legacy monolith (still 70% of functionality, can't delete it)
  + 3 new microservices (added complexity)
  + shared DB (coupling between old and new)
  = All the complexity of microservices + none of the benefits
```

Mitigate by having a clear migration plan and executive commitment to finish.

---

## Strangler Fig vs Branch by Abstraction

Two complementary patterns:

| | Strangler Fig | Branch by Abstraction |
|---|---|---|
| Scope | System/service level | Code/component level |
| Mechanism | Proxy/facade routes traffic | Abstraction layer + feature flag |
| Rollback | Route traffic back to old | Flip feature flag |
| Use for | Extracting a whole service | Replacing a library or component within a service |

Branch by Abstraction:
```python
# Old: using Requests library
class OldHttpClient:
    def get(self, url): return requests.get(url)

# New: replacing with aiohttp
class NewHttpClient:
    async def get(self, url): return await aiohttp.get(url)

# Abstraction layer: route by feature flag
class HttpClient:
    def get(self, url):
        if feature_flags.is_enabled('use_async_http_client'):
            return NewHttpClient().get(url)
        return OldHttpClient().get(url)
```

---

## Interview talking points

!!! tip "Key things to say"
    1. Strangler Fig is the answer to "how do you migrate a monolith?" — big bang rewrites almost always fail
    2. The facade/proxy is the linchpin — it lets you redirect traffic without clients knowing
    3. Data migration is harder than code migration — dual-write and CDC are the tools
    4. Extract by bounded context (DDD) — domain seams are the natural service boundaries
    5. A distributed monolith is worse than a monolith — warn about this when describing the migration
    6. Roll out gradually with feature flags or traffic percentages — never flip 100% at once

## Related topics

- [Monolith vs Microservices](monolith-vs-microservices.md) — why and when you'd migrate
- [Domain-Driven Design](ddd.md) — bounded contexts identify service boundaries
- [API Gateway](../networking/api-gateway.md) — often used as the strangler facade
- [Event-Driven Architecture](event-driven.md) — event-driven sync during data migration
- [Saga Pattern](../patterns/saga-pattern.md) — managing distributed transactions in the new services
