# The 8 Fallacies of Distributed Computing

Originally articulated by Peter Deutsch and James Gosling at Sun Microsystems (1994-1997). These are the false assumptions developers make when building distributed systems — each one leads to a class of production failures.

> "Essentially everyone, when they first build a distributed application, makes the following eight assumptions. All prove to be false in the long run and all cause big trouble."

---

## Fallacy 1: The network is reliable

**The assumption:** If I send a message, it will arrive.

**The reality:** Networks drop packets, connections time out, TCP connections reset, load balancers silently drop requests under pressure.

```
What you write:
  response = http.post("http://payment-service/charge", data)
  if response.status == 200:
      order.mark_paid()
  
What can actually happen:
  1. Request sent, payment service crashes after charging but before responding
     → You think payment failed, but money was taken
  
  2. Network drops response (not request)
     → Payment succeeded, but you retry → double charge
  
  3. Connection resets mid-response
     → Response truncated → partial JSON → parse error
```

**What it forces you to do:**
- Design for **at-least-once delivery** — assume messages may not arrive
- Make all operations **idempotent** — safe to call multiple times
- Implement **timeouts** — never wait forever
- Use **acknowledgments** — don't assume delivery

```python
# Wrong: assume the call worked
def charge_customer(order_id, amount):
    requests.post('/charge', json={'order_id': order_id, 'amount': amount})
    order.mark_paid()  # what if the request failed silently?

# Right: use idempotency key + explicit retry with acknowledgment
def charge_customer(order_id, amount):
    idempotency_key = f"charge:{order_id}"  # same key on retry = same result
    for attempt in range(3):
        try:
            resp = requests.post(
                '/charge',
                json={'order_id': order_id, 'amount': amount},
                headers={'Idempotency-Key': idempotency_key},
                timeout=5,
            )
            if resp.status_code == 200:
                order.mark_paid()
                return
        except requests.Timeout:
            if attempt == 2:
                raise  # re-raise after all retries
            time.sleep(2 ** attempt)  # exponential backoff
```

---

## Fallacy 2: Latency is zero

**The assumption:** Calling a remote service is as fast as calling a local function.

**The reality:**
```
In-process function call:  ~1 nanosecond
Redis (same DC):            ~0.5 milliseconds  (500,000× slower)
HTTP call (same DC):        ~1 millisecond      (1,000,000× slower)
Cross-region HTTP:          ~100 milliseconds   (100,000,000× slower)
```

**What breaks when you assume zero latency:**

```python
# Disaster: N+1 problem — treating remote calls like local ones
def render_user_dashboard(user_id):
    user = user_service.get(user_id)           # 1 HTTP call
    orders = order_service.get_orders(user_id) # 1 HTTP call
    
    order_details = []
    for order in orders:                       # N HTTP calls in a loop!
        detail = order_service.get_detail(order.id)   # ← this is the problem
        detail.product = product_service.get(detail.product_id)  # ← and this
        order_details.append(detail)
    
    # For 20 orders: 1 + 1 + 20 + 20 = 42 HTTP calls
    # At 1ms each: 42ms if serial, but probably sequential = 42ms min
    # Under load: 200ms+ easily
```

```python
# Right: batch and parallelize
async def render_user_dashboard(user_id):
    # Parallel first-level fetches
    user, orders = await asyncio.gather(
        user_service.get_async(user_id),
        order_service.get_orders_async(user_id),
    )
    
    # Batch second-level fetches
    order_ids = [o.id for o in orders]
    product_ids = [o.product_id for o in orders]
    
    details, products = await asyncio.gather(
        order_service.get_details_batch(order_ids),    # 1 call for all
        product_service.get_batch(product_ids),         # 1 call for all
    )
    # Total: 4 parallel calls → ~1ms instead of 42ms
```

**What it forces you to do:**
- Measure and budget latency per operation
- Batch requests when fetching multiple items
- Use async/parallel calls for independent operations
- Cache aggressively to avoid repeat remote calls
- Set explicit timeouts on every network call

---

## Fallacy 3: Bandwidth is infinite

**The assumption:** I can send as much data as needed.

**The reality:** Bandwidth costs money, has limits, and is shared. A few services sending large payloads will saturate internal network links.

```
Real bandwidth limits:
  EC2 instance (m5.large):  10 Gbps  (but shared with other traffic)
  Cross-AZ bandwidth:       $0.01/GB (adds up fast)
  Cross-region bandwidth:   $0.09/GB
  
A service returning 1MB responses × 10,000 req/sec = 10GB/sec required
→ Exceeds single instance bandwidth
→ Costs $864/day cross-region
```

**What breaks when you assume infinite bandwidth:**

```python
# Wrong: return entire entity graph
def get_order(order_id):
    order = db.get_order(order_id)
    order.customer = db.get_customer(order.customer_id)  # entire customer
    order.items = [db.get_product(i.product_id) for i in order.items]  # all products
    order.history = db.get_full_history(order_id)  # all 500 history entries
    return order  # 50KB response

# Right: return what the caller needs
def get_order_summary(order_id, fields=None):
    query = build_sparse_query(order_id, fields or ['id', 'status', 'total'])
    return db.query(query)  # 1KB response
```

**What it forces you to do:**
- Design lean API responses (only send what clients need)
- Paginate large result sets
- Use compression (gzip responses)
- Use binary protocols (gRPC/Protobuf instead of JSON) for high-throughput paths
- BFF pattern — each client gets exactly what it needs

---

## Fallacy 4: The network is secure

**The assumption:** Internal network traffic is safe to trust.

**The reality:** Internal networks are breached. Attackers who compromise one service can intercept traffic to all others if you assume the internal network is safe.

```
Attack scenario:
  Attacker compromises the "Recommendation Service" (low-risk service)
  Internal network is unencrypted
  Attacker reads all internal traffic:
    Payment service requests (card numbers)
    Auth service tokens (user sessions)
    DB queries (PII)
```

**What it forces you to do:**
- TLS everywhere — even service-to-service inside the cluster
- mTLS (mutual TLS) — both sides verify identity
- Service mesh (Istio, Linkerd) — enforces mTLS automatically
- Zero Trust architecture — never trust, always verify
- Secrets management — never hardcode credentials

---

## Fallacy 5: Topology doesn't change

**The assumption:** The IPs and hostnames of services stay the same.

**The reality:** In cloud and container environments, IPs change constantly:
- Containers restart with new IPs
- Auto-scaling adds and removes instances
- Deployments replace instances
- AWS: IPs of EC2 instances change on restart

```
Hardcoded IP disaster:
  config.py: DATABASE_HOST = "10.0.1.45"
  
  Database instance restarts after maintenance → new IP: 10.0.1.67
  App tries to connect to 10.0.1.45 → connection refused
  → Outage
```

**What it forces you to do:**
- **Service discovery** — services register themselves; clients look up addresses dynamically
- **DNS-based discovery** — use hostnames, not IPs. DNS TTL handles changes
- **Load balancer DNS names** — stable endpoint in front of dynamic instances
- **Health checks** — remove unhealthy instances from DNS/load balancer automatically
- **Client-side retry** — if a connection fails, re-discover and retry

---

## Fallacy 6: There is one administrator

**The assumption:** One team controls all the infrastructure; changes are coordinated.

**The reality:** Different teams own different services. Different cloud regions have different operators. Third-party services have their own admin teams you don't control.

```
Multi-team failure:
  Your team: deploys new API version
  DB team: runs maintenance migration at the same time
  Network team: rotates TLS certificates simultaneously
  
  Combined effect:
    API calls fail during migration (locks)
    TLS rotation causes connection resets
    Error rate spikes → pagers go off → three teams debugging simultaneously
    Root cause? All three changes interacting
```

**What it forces you to do:**
- **Change management** — coordinate deployments across teams
- **Feature flags** — decouple deployment from activation
- **Circuit breakers** — isolate failures from third-party services
- **SLOs** — formalize what each team guarantees to others
- **Runbooks** — document how to operate when the original author is unavailable

---

## Fallacy 7: Transport cost is zero

**The assumption:** Serialization, deserialization, and network hops cost nothing.

**The reality:**

```
Serialization costs:
  JSON serialize 1MB object:   ~5ms
  JSON deserialize 1MB object: ~10ms
  Protobuf serialize same:     ~0.5ms (10× faster)
  Protobuf deserialize same:   ~0.5ms (20× faster)
  
At 10,000 req/sec with 100KB JSON payloads:
  Serialization alone: 10,000 × 0.5ms = 5,000ms CPU time/sec → 5 CPU cores just for JSON
  Protobuf: 10,000 × 0.05ms = 500ms CPU → 0.5 cores
```

**What it forces you to do:**
- Choose serialization format intentionally — JSON vs Protobuf vs MessagePack vs Avro
- Measure serialization overhead at scale
- Minimize cross-network hops (fewer round trips = lower total latency)
- Consider payload compression for large responses
- Count network calls in code review ("this loop makes N calls")

---

## Fallacy 8: The network is homogeneous

**The assumption:** All nodes run the same OS, same network stack, same hardware.

**The reality:** Modern systems span multiple cloud providers, regions, hardware generations, and OS versions. A bug that's silent on Ubuntu 22.04 may crash on Amazon Linux 2. A network that behaves in us-east-1 may behave differently in ap-southeast-1 under high packet loss.

```
Real examples:
  Time zone differences between regions → timestamp bugs
  Different SSL/TLS versions → handshake failures
  Different TCP buffer sizes → performance differences
  Different glibc versions → DNS behavior differences
  IPv4 vs IPv6 differences → routing surprises
  MTU differences between cloud providers → silent packet fragmentation
```

**What it forces you to do:**
- Test in environments that mirror production (not just localhost)
- Use containers to standardize runtime environments
- Test under network degradation (chaos engineering — kill nodes, inject latency)
- Never assume behavior observed on one machine applies everywhere

---

## Summary: What these fallacies demand

| Fallacy | The real requirement |
|---|---|
| Network is reliable | Idempotency, retries, at-least-once delivery |
| Latency is zero | Batch calls, async/parallel, timeouts on everything |
| Bandwidth is infinite | Lean responses, pagination, compression, binary protocols |
| Network is secure | TLS everywhere, mTLS, Zero Trust |
| Topology doesn't change | Service discovery, DNS, health checks |
| One administrator | Feature flags, circuit breakers, SLOs, runbooks |
| Transport cost is zero | Measure serialization, minimize round trips |
| Network is homogeneous | Test in production-like environments, chaos engineering |

---

## Interview talking points

!!! tip "Key things to say"
    1. The most commonly violated: **latency is zero** (N+1 queries) and **network is reliable** (no timeouts, no idempotency)
    2. These aren't abstract — each one maps directly to a class of production incidents
    3. "Latency is zero" is why the N+1 problem is so dangerous — developers think in function calls, not network calls
    4. "Network is reliable" is why every payment system needs idempotency keys — the charge may succeed but the response may not arrive
    5. "Topology doesn't change" is why hardcoding IPs is a capital offense in distributed systems

## Related topics

- [Failure Detection](failure-detection.md) — Fallacy 1: networks fail, so you need failure detection
- [Service Discovery](service-discovery.md) — Fallacy 5: topology changes, so services must register dynamically
- [Idempotency](../patterns/idempotency.md) — Fallacy 1: network unreliability requires idempotent operations
- [Circuit Breaker](../patterns/circuit-breaker.md) — Fallacy 4 & 6: isolate third-party failures
- [Distributed Locks](distributed-locks.md) — Fallacy 1: operations that must happen exactly once despite unreliable delivery
