# Bulkhead Pattern

## What it is

The Bulkhead pattern isolates elements of a system into pools so that if one fails, the others continue to function. Named after the watertight compartments in a ship's hull — if one compartment floods, the others keep the ship afloat.

## The problem

Without bulkheads, a slow or failing dependency exhausts shared resources and takes down the entire application:

```
Service A has one thread pool: 20 threads
Service A calls 3 downstream services: Payment, Inventory, Notifications

Normal:
  Payment:      5 threads
  Inventory:    5 threads
  Notifications: 5 threads
  Available:    5 threads

Payment service becomes slow (10s timeouts):
  Payment:      20 threads (all blocked waiting for payment)
  Inventory:    0 threads (no resources!)
  Notifications: 0 threads (no resources!)
  
→ Inventory and Notification calls fail even though they're working fine
→ Entire service is degraded because of one dependency
```

## Thread pool bulkhead

Assign a separate thread pool to each dependency:

```python
from concurrent.futures import ThreadPoolExecutor

class ServiceA:
    def __init__(self):
        # Separate thread pools per downstream service
        self.payment_pool = ThreadPoolExecutor(max_workers=5, thread_name_prefix="payment")
        self.inventory_pool = ThreadPoolExecutor(max_workers=5, thread_name_prefix="inventory")
        self.notification_pool = ThreadPoolExecutor(max_workers=5, thread_name_prefix="notification")
    
    def process_order(self, order):
        # Payment pool — if payment is slow, only 5 threads blocked
        payment_future = self.payment_pool.submit(self.payment_service.charge, order)
        
        # Inventory unaffected even if payment is saturated
        inventory_future = self.inventory_pool.submit(self.inventory_service.reserve, order)
        
        # Wait for both
        payment_result = payment_future.result(timeout=5)
        inventory_result = inventory_future.result(timeout=5)
```

**Sizing:** Choose pool sizes based on expected load and acceptable saturation. Too large defeats the purpose; too small creates unnecessary queueing.

## Semaphore bulkhead

Limit concurrent calls without creating threads (better for async code):

```python
import asyncio

class ServiceA:
    def __init__(self):
        # Max 5 concurrent calls to payment, 10 to inventory
        self.payment_semaphore = asyncio.Semaphore(5)
        self.inventory_semaphore = asyncio.Semaphore(10)
    
    async def call_payment(self, order):
        async with self.payment_semaphore:
            return await self.payment_service.charge(order)
        # When semaphore full: raises immediately (or waits, based on config)
    
    async def call_inventory(self, order):
        async with self.inventory_semaphore:
            return await self.inventory_service.reserve(order)
```

## Connection pool bulkhead

Database connections are a critical resource. Isolate connection pools per service/purpose:

```python
# Without bulkhead: one shared pool
db_pool = create_pool(max_connections=50)

# With bulkhead: separate pools
user_db_pool      = create_pool(max_connections=15)  # user reads/writes
order_db_pool     = create_pool(max_connections=20)  # order writes
reporting_db_pool = create_pool(max_connections=10)  # analytics queries
admin_db_pool     = create_pool(max_connections=5)   # admin operations

# Heavy reporting query saturates reporting_db_pool
# User service is unaffected — its own pool
```

**Database read replica as bulkhead:**
```
Write pool → Primary DB (for writes + critical reads)
Read pool  → Read Replica (for reports, analytics, bulk operations)

Long-running analytics query can't starve write traffic
```

## Kubernetes: resource limits as bulkheads

CPU/memory limits per container prevent one service from starving others:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

**Namespace resource quotas:**
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  namespace: payment-service
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    limits.cpu: "8"
    limits.memory: 16Gi
```

## AWS: separate infrastructure per workload

```
Production API: separate ECS cluster, separate RDS instance
  → Analytics and batch jobs can't affect prod

Batch jobs: spot instances, separate Auto Scaling Group
  → Can be terminated without affecting API

Reporting queries: read replica + separate connection pool
  → Long queries can't starve write traffic
```

## Bulkhead sizing guidelines

Too small: unnecessary request failures (semaphore saturated before real problem)  
Too large: doesn't provide isolation (might as well share the pool)

```
Rule of thumb:
  Expected concurrent calls to dependency × 1.5-2x safety factor

Example:
  Payment service: 100 QPS × 200ms avg latency
  = 100 × 0.2 = 20 concurrent calls (Little's Law)
  Pool size: 20 × 1.5 = 30 threads/semaphores
```

## Circuit Breaker + Bulkhead

Complementary patterns:

```
Bulkhead: limits concurrent calls (prevents resource exhaustion)
Circuit Breaker: stops calls when dependency is failing (fail-fast)

Together:
1. Bulkhead prevents new calls from exhausting resources
2. Circuit Breaker detects failure rate, opens circuit
3. When circuit opens: bulkhead is empty (no blocked threads)
4. Both together prevent cascade failure
```

## Resilience4j (Java) combined

```java
// Bulkhead
BulkheadConfig bulkheadConfig = BulkheadConfig.custom()
    .maxConcurrentCalls(10)
    .maxWaitDuration(Duration.ofMillis(100))  // fail fast if full
    .build();

// Circuit Breaker
CircuitBreakerConfig cbConfig = CircuitBreakerConfig.custom()
    .failureRateThreshold(50)
    .build();

// Decorate both
Supplier<Response> decorated = Decorators.ofSupplier(() -> paymentService.charge(amount))
    .withBulkhead(Bulkhead.of("payment", bulkheadConfig))
    .withCircuitBreaker(CircuitBreaker.of("payment", cbConfig))
    .withFallback(e -> defaultFallback())
    .decorate();
```

## Interview angle

!!! tip "When to mention bulkheads"
    Any system with multiple downstream dependencies — especially if they have different reliability profiles.

**Strong answer pattern:**
1. Identify dependencies with different failure probabilities or response times
2. Separate thread pools / connection pools per dependency
3. Size pools based on expected concurrency (Little's Law)
4. Combine with circuit breaker for complete failure isolation
5. In Kubernetes: resource limits as bulkheads between services

## Related topics

- [Circuit Breaker](circuit-breaker.md) — complementary pattern
- [Availability & Reliability](../fundamentals/availability.md) — why isolation matters
- [Rate Limiting](rate-limiting.md) — limiting concurrency from the client side
- [Retry & Timeout](retry-timeout.md) — the full resilience toolkit
