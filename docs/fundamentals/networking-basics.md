# Networking Fundamentals

Before diving into load balancers, CDNs, or WebSockets, you need a solid mental model of how data moves across a network. These are the concepts that underpin every distributed system.

---

## The OSI Model (and why it matters)

The OSI model describes networking in 7 layers. In practice, you'll mostly reason about layers 3–7.

| Layer | Name | What it does | Protocols / Technologies |
|---|---|---|---|
| 7 | **Application** | User-facing protocols | HTTP, gRPC, DNS, SMTP |
| 6 | Presentation | Encoding, encryption | TLS/SSL, JSON encoding |
| 5 | Session | Connection management | (mostly baked into transport layer) |
| 4 | **Transport** | End-to-end delivery, ports | TCP, UDP |
| 3 | **Network** | Routing between networks | IP, ICMP |
| 2 | Data Link | Node-to-node transfer on same link | Ethernet, Wi-Fi |
| 1 | Physical | Bits on a wire | Cables, radio waves |

**Why it matters for system design:**
- Layer 4 load balancers route by IP/port (fast, no TLS termination)
- Layer 7 load balancers route by HTTP headers/URLs (smarter, more expensive)
- Firewalls operate at Layer 3-4; WAFs at Layer 7
- CDNs cache Layer 7 content

---

## TCP vs UDP

The choice between TCP and UDP is one of the first decisions for any networked system.

### TCP (Transmission Control Protocol)

TCP provides **reliable, ordered delivery** with connection state.

```
TCP handshake (3-way):
  Client → SYN      →  Server
  Client ← SYN-ACK  ←  Server
  Client → ACK       →  Server
  [connection established]

For HTTPS (TLS):
  + TLS handshake adds 1-2 more round trips
  = 2-3 RTT before first byte of data
```

**What TCP guarantees:**
- **Delivery** — lost packets are retransmitted
- **Ordering** — packets arrive in sequence
- **Flow control** — sender won't overwhelm receiver
- **Congestion control** — sender slows down if network is congested

**Cost of these guarantees:**
- Handshake latency (1 RTT minimum before data)
- Head-of-line blocking — one lost packet stalls all subsequent packets
- Connection state maintained on both ends

**Use TCP when:** Data integrity matters — HTTP, databases, file transfer, email.

### UDP (User Datagram Protocol)

UDP is **fire-and-forget** — no handshake, no retransmission, no ordering.

```
Client → Packet → Server (no handshake, no ack, no retransmit)
```

**What UDP gives you:**
- Lower latency — no handshake
- No head-of-line blocking
- Multicast support (one packet to many recipients)
- You control exactly what retransmission logic (if any) you want

**Use UDP when:** Latency matters more than reliability — live video, gaming, DNS, VoIP, QUIC/HTTP3.

| | TCP | UDP |
|---|---|---|
| Connection | Stateful (3-way handshake) | Stateless |
| Delivery | Guaranteed + retransmit | Best effort |
| Ordering | Guaranteed | Not guaranteed |
| Speed | Slower (overhead) | Faster (no overhead) |
| Head-of-line blocking | Yes | No |
| Use cases | HTTP, DB, email, SSH | Video, gaming, DNS, QUIC |

---

## IP Addressing

Every device on a network has an IP address.

```
IPv4: 192.168.1.100   (32-bit, ~4 billion addresses — exhausted)
IPv6: 2001:db8::1     (128-bit, virtually unlimited)

Private (non-routable) ranges:
  10.0.0.0/8         — 16 million addresses (AWS VPCs, internal networks)
  172.16.0.0/12      — 1 million addresses
  192.168.0.0/16     — 65,536 addresses (home networks)
```

### CIDR notation

`10.0.0.0/24` means: first 24 bits are the network, last 8 bits are hosts.
- `/24` → 256 addresses (10.0.0.0 – 10.0.0.255)
- `/16` → 65,536 addresses
- `/32` → exactly one IP

This matters when configuring VPCs, security groups, and firewall rules.

---

## DNS (Domain Name System)

DNS translates human-readable names to IP addresses. It's the phone book of the internet.

```
Browser: what is the IP for api.example.com?

1. Check local cache          → miss
2. Ask OS resolver            → miss
3. Ask recursive resolver (ISP or 8.8.8.8)
4. Resolver asks root server  → "ask .com nameserver"
5. Resolver asks .com NS      → "ask example.com nameserver"
6. Resolver asks example.com NS → "api.example.com = 203.0.113.42" (TTL: 300s)
7. Cache and return           → 203.0.113.42

Total: ~50-100ms for a cold lookup, ~0ms for a cached lookup
```

### Key DNS record types

| Record | Purpose | Example |
|---|---|---|
| **A** | Domain → IPv4 address | `api.example.com → 203.0.113.42` |
| **AAAA** | Domain → IPv6 address | `api.example.com → 2001:db8::1` |
| **CNAME** | Alias → another domain | `www.example.com → example.com` |
| **MX** | Mail exchange | `example.com → mail.example.com` |
| **TXT** | Arbitrary text (SPF, DKIM) | `v=spf1 include:sendgrid.net` |
| **NS** | Nameserver for a domain | `example.com → ns1.route53.amazonaws.com` |

### TTL and caching

TTL (Time To Live) controls how long DNS responses are cached. Low TTL = faster propagation but more queries. High TTL = faster lookups but slow propagation on change.

```
TTL = 300 (5 min):  Change propagates within 5 minutes. Good for dynamic environments.
TTL = 86400 (1 day): Cached for a day. Good for stable records, reduces DNS load.
```

**GeoDNS:** Return different IPs based on the user's location. Used for routing users to the nearest region.

---

## HTTP fundamentals

HTTP is the application-layer protocol powering the web. Every API you build runs on top of it.

### Request/Response structure

```
GET /users/123 HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGci...
Accept: application/json

── empty line (end of headers) ──

[request body if POST/PUT]
```

```
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 145
Cache-Control: max-age=300

{
  "user_id": 123,
  "name": "Alice"
}
```

### Status codes you must know

| Code | Meaning | When to use |
|---|---|---|
| 200 | OK | Successful GET/PUT/PATCH |
| 201 | Created | Successful POST that created a resource |
| 204 | No Content | Successful DELETE (no body) |
| 301 | Moved Permanently | Permanent redirect (cached by browser) |
| 302 | Found | Temporary redirect |
| 400 | Bad Request | Invalid input — don't retry |
| 401 | Unauthorized | Not authenticated |
| 403 | Forbidden | Authenticated but no permission |
| 404 | Not Found | Resource doesn't exist — don't retry |
| 409 | Conflict | Resource conflict (duplicate create) |
| 429 | Too Many Requests | Rate limited — retry after backoff |
| 500 | Internal Server Error | Server bug — may retry |
| 502 | Bad Gateway | Upstream service returned invalid response |
| 503 | Service Unavailable | Overloaded or down — retry with backoff |
| 504 | Gateway Timeout | Upstream didn't respond in time |

### HTTP methods semantics

| Method | Idempotent | Safe | Body | Use for |
|---|---|---|---|---|
| GET | Yes | Yes | No | Fetch a resource |
| POST | No | No | Yes | Create a resource |
| PUT | Yes | No | Yes | Replace a resource entirely |
| PATCH | No | No | Yes | Partial update |
| DELETE | Yes | No | No | Remove a resource |
| HEAD | Yes | Yes | No | Fetch headers only (check existence) |

**Idempotent** = calling N times has same effect as calling once.  
**Safe** = doesn't modify state.

---

## TLS / HTTPS

TLS (Transport Layer Security) provides encryption, authentication, and integrity.

```
TLS 1.3 handshake (1 RTT):
  Client → ClientHello (supported ciphers, key share)
  Server → ServerHello (chosen cipher, key share, certificate)
  Client → [verifies cert against CA] → Finished
  [encrypted channel established]
```

**What TLS provides:**
- **Confidentiality** — traffic encrypted in transit (prevents wiretapping)
- **Authentication** — certificate proves server identity (prevents impersonation)
- **Integrity** — MAC ensures data wasn't tampered with in transit

**Certificate chain:**
```
Your cert (api.example.com)
  ← signed by → Intermediate CA
                  ← signed by → Root CA (trusted by all browsers)
```

**Mutual TLS (mTLS):** Both client and server present certificates. Used for service-to-service authentication in microservices (rather than API keys).

---

## Ports

Ports identify which process on a host should receive a packet.

| Port | Protocol |
|---|---|
| 22 | SSH |
| 53 | DNS (UDP) |
| 80 | HTTP |
| 443 | HTTPS |
| 3306 | MySQL |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 9092 | Kafka |
| 27017 | MongoDB |

Ports 0–1023 are "well-known" ports requiring root privileges. Applications use ports 1024–65535.

---

## Bandwidth, Latency, and Packet Loss

Three network characteristics that bound system performance:

**Bandwidth:** Maximum data rate (bits per second). Determines max throughput.

**Latency:** Time for a packet to travel from source to destination.
```
London → New York: ~70ms (speed of light in fiber ≈ 200,000 km/s)
London → Sydney:  ~170ms
Same datacenter:  <1ms
```

**Packet loss:** % of packets that don't arrive. TCP retransmits; UDP drops them.
- Even 0.1% loss noticeably degrades TCP throughput (triggers congestion control)
- 1% loss makes a connection feel sluggish

**Bandwidth-delay product:** How much data can be "in flight" at once.
```
100Mbps link × 100ms RTT = 10Mb in flight
```
This is the buffer size needed to fully utilize a high-latency link.

---

## Interview angle

!!! tip "Networking questions in system design"
    - *"Should this use TCP or UDP?"* → TCP for correctness (databases, APIs, payments). UDP for latency-sensitive streaming (video, gaming, QUIC).
    - *"How does DNS-based load balancing work?"* → Return multiple A records or use GeoDNS to route to the nearest region. Caveats: DNS caching means changes propagate slowly; clients may pin to one IP.
    - *"What's the difference between a Layer 4 and Layer 7 load balancer?"* → L4 routes by IP/port (fast, no TLS termination). L7 routes by URL, headers, cookies (smarter, can do path-based routing and SSL termination).

## Related topics

- [DNS](../networking/dns.md) — deep dive on DNS, routing, GeoDNS
- [Load Balancing](../networking/load-balancing.md) — L4 vs L7, algorithms
- [HTTP Versions](../networking/http-versions.md) — HTTP/1.1 → HTTP/2 → HTTP/3 (QUIC)
- [API Security: TLS/mTLS](../security/api-security.md) — securing service communication
- [Latency vs Throughput](latency-throughput.md) — performance fundamentals
