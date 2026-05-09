# Networking

Every request a user makes traverses multiple networking layers before hitting your application code. Understanding how these layers work — and where they fail — is essential for designing systems with predictable latency, high availability, and correct behavior under load.

---

## The request path

```
User types URL
  │
  ├─ DNS resolution     → IP address for the hostname
  ├─ CDN edge           → Serves cached response (cache hit) or forwards upstream
  ├─ Load balancer      → Picks a healthy backend instance
  ├─ Reverse proxy      → TLS termination, auth, rate limiting
  ├─ API gateway        → Routing, versioning, observability
  └─ App server         → Business logic
```

Each hop adds latency. Each hop is a failure point. Designing well means placing logic at the right hop.

---

## Topics in this section

| Topic | What it covers | When it matters |
|---|---|---|
| [DNS](dns.md) | Name resolution, TTLs, routing tricks | Every system — the first hop before any connection |
| [CDN](cdn.md) | Edge caching, push vs pull, invalidation | Static assets, global latency reduction, DDoS absorption |
| [Load Balancing](load-balancing.md) | L4 vs L7, algorithms, sticky sessions, health checks | Any multi-instance deployment |
| [Proxies](proxies.md) | Forward vs reverse proxy, what each solves | TLS termination, egress control, caching |
| [API Gateway](api-gateway.md) | Auth, rate limiting, routing, observability at the edge | Public APIs, microservices entry point |
| [WebSockets & SSE](websockets-sse.md) | Persistent connections for real-time data push | Chat, live feeds, collaborative editing |
| [HTTP Versions](http-versions.md) | HTTP/1.1 vs HTTP/2 vs HTTP/3 — multiplexing, QUIC | Performance tuning, gRPC, high-concurrency APIs |

---

## Concept map

```
DNS
  ├── A / CNAME records          → hostname → IP
  ├── TTL tuning                 → failover speed vs cache poisoning
  └── Weighted routing (Route 53)→ canary, regional failover

CDN
  ├── Edge PoP caches response
  ├── Pull (lazy) vs Push (pre-warm)
  └── Cache-Control / Surrogate-Control headers

Load Balancer
  ├── L4 (TCP/UDP)  → fast, dumb, no HTTP awareness
  ├── L7 (HTTP/gRPC)→ routing by path/host, sticky sessions, TLS termination
  └── Algorithms: Round robin, least-connections, IP hash, consistent hashing

Proxy
  ├── Forward proxy  → client side, egress control, caching
  └── Reverse proxy  → server side, TLS termination, WAF, rate limiting

API Gateway
  ├── Auth (JWT validation, API keys)
  ├── Rate limiting / throttling
  ├── Request routing and transformation
  └── Observability (access logs, metrics)

HTTP Evolution
  HTTP/1.1 → 1 request per connection (head-of-line blocking)
  HTTP/2   → multiplexed streams over 1 TCP conn
  HTTP/3   → streams over QUIC (UDP), eliminates TCP HOL blocking
```

---

## Interview shortlist

| Question | Key answer |
|---|---|
| *"How does DNS failover work?"* | Low TTL (30-60s) on health-checked records. Route 53 health checks → swap A record. Downtime = TTL window. |
| *"L4 vs L7 load balancer — when to use each?"* | L4: low latency, TLS passthrough, non-HTTP protocols. L7: path-based routing, sticky sessions, WebSocket upgrades, gRPC. |
| *"Why does CDN help with DDoS?"* | Absorbs volumetric attacks at the edge. Anycast routing means attack traffic is distributed across PoPs. Origin never sees the flood. |
| *"How do WebSockets work behind a load balancer?"* | Need sticky sessions or L7 LB that understands WS upgrades. Stateful connection lives on one backend — if it dies, client reconnects. |
| *"HTTP/2 vs HTTP/3 — what problem does each solve?"* | HTTP/2: multiplexing (no per-request connections). HTTP/3: QUIC removes TCP head-of-line blocking that HTTP/2 still had at transport layer. |

---

## Related topics

- [API Design](../api/index.md) — what travels over the network
- [Caching](../caching/index.md) — CDN and in-process caching strategies
- [Patterns: Rate Limiting](../patterns/rate-limiting.md) — enforced at the API gateway
- [Fundamentals: Networking Basics](../fundamentals/networking-basics.md) — TCP/IP, DNS, TLS fundamentals
