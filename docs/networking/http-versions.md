# HTTP Versions

## HTTP/1.0 → HTTP/1.1 → HTTP/2 → HTTP/3

Understanding how HTTP evolved helps you make smarter decisions about API design, CDN config, and performance optimization.

## HTTP/1.0

- One request per TCP connection
- Connection closed after each response
- Every request: DNS lookup + TCP handshake + request/response
- **Problem:** Loading a page with 50 resources = 50 TCP handshakes

## HTTP/1.1

**Key improvements:**
- **Persistent connections:** TCP connection reused for multiple requests (`Connection: keep-alive` by default)
- **Pipelining:** Multiple requests without waiting for each response (theoretically)
- **Chunked transfer encoding:** Stream response body
- **Host header:** Required — enables virtual hosting (multiple domains on one IP)

**Remaining problem — Head-of-Line (HOL) blocking:**
```
Request 1 (slow) → waiting for response...
Request 2 (fast) → blocked behind Request 1
Request 3 (fast) → blocked behind Request 1

Even with 6 parallel connections (browser limit),
HOL blocking causes inefficiency.
```

**Workarounds (pre-HTTP/2):**
- Domain sharding: `static1.example.com`, `static2.example.com` → more parallel connections
- CSS sprites, JS bundling → fewer requests
- Inlining small assets

## HTTP/2

**Key improvements:**

### Multiplexing (solves HOL blocking)

```
HTTP/1.1: One request at a time per connection (or pipelined but blocked)
HTTP/2:   Multiple concurrent streams on ONE connection

Stream 1: [req]→→→[res...]
Stream 2:      [req]→[res]
Stream 3:           [req]→→→[res...]

All interleaved on the same TCP connection.
No blocking.
```

### Header compression (HPACK)

HTTP/1.1 headers are plaintext, repeated on every request:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1...  (200+ bytes, every request)
User-Agent: Mozilla/5.0 ... (100+ bytes, every request)
```

HPACK compresses and maintains a shared header table:
```
First request:  Send full header → add to table (index 100)
Next request:   Send ":100" instead → 1 byte for 200-byte header
```

### Server Push

Server proactively sends resources the client will need:
```
Client: GET /index.html
Server: Here's index.html
Server: (PUSH_PROMISE) Here's /style.css (you'll need it)
Server: (PUSH_PROMISE) Here's /app.js (you'll need it)
```

**Reality:** Server push is tricky to implement correctly and often pushes things already in the browser cache. Most CDNs removed support. Use `<link rel="preload">` instead.

### Binary framing

HTTP/2 is binary (frames) not text — more efficient to parse, easier to implement correctly.

### Implications for system design

With HTTP/2:
- **Don't shard domains** — connection per domain is counterproductive
- **Don't bundle aggressively** — multiplexing means many small files are fine
- **HTTP/2 + TLS required** — virtually all implementations require HTTPS
- **gRPC requires HTTP/2** — this is why gRPC needs HTTP/2 support in infrastructure

## HTTP/3 (QUIC)

HTTP/2's remaining limitation: it runs on TCP. TCP has its own HOL blocking at the transport layer — if one packet is lost, all streams wait for retransmit.

**HTTP/3 solution:** Replace TCP with **QUIC** (UDP + reliability + multiplexing built in):

```
HTTP/1.1: HTTP over TCP
HTTP/2:   HTTP over TCP (HOL blocked by TCP)
HTTP/3:   HTTP over QUIC (UDP-based, no TCP HOL blocking)
```

### QUIC advantages

**Connection migration:** Client IP changes (e.g., mobile switching from WiFi to cellular) — QUIC connection survives. TCP connection would drop.

**0-RTT (Zero Round Trip Time) resumption:** Resume a known session without a full handshake:
```
HTTP/1.1 HTTPS: DNS + TCP handshake + TLS handshake = 3 round trips before data
HTTP/2 HTTPS:   DNS + TCP + TLS = 3 round trips (same)
HTTP/3 QUIC:    0-RTT resume = data sent in first packet (for known servers)
```

**Independent stream multiplexing:** Each QUIC stream is independent — packet loss in stream 1 doesn't block stream 2.

### Adoption

HTTP/3 is supported by all major browsers and CDNs (CloudFront, Cloudflare, Fastly). Enable it at the CDN/edge — your origin doesn't need to speak QUIC.

```
Client ←HTTP/3 (QUIC)→ CloudFront Edge ←HTTP/2→ ALB/Origin
```

## TLS 1.3

Not a new HTTP version but critical context:

```
TLS 1.2: 2 round trips for handshake
TLS 1.3: 1 round trip (faster)
TLS 1.3: 0-RTT session resumption (fastest)
```

TLS 1.3 is the minimum standard for new deployments. Disable TLS 1.0/1.1 (PCI DSS requirement).

## Comparison table

| Feature | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| Multiplexing | No (HOL blocking) | Yes (per-connection) | Yes (independent streams) |
| Header compression | No | HPACK | QPACK |
| Transport | TCP | TCP | QUIC (UDP) |
| Server Push | No | Yes (rarely used) | Yes (rarely used) |
| Connection migration | No | No | Yes |
| 0-RTT | No | No | Yes |
| TLS required | No | Effectively yes | Yes (QUIC includes TLS 1.3) |
| gRPC support | No | Yes | In progress |

## AWS support

| Service | HTTP/2 | HTTP/3 |
|---|---|---|
| CloudFront | Yes | Yes (QUIC) |
| ALB | Yes | No |
| API Gateway | Yes (HTTP API) | No |
| S3 | No (via CloudFront) | Via CloudFront |

Enable HTTP/3 on CloudFront:
```
Supported HTTP versions: HTTP/3 ✓
```

## Interview angle

!!! tip "When this comes up"
    HTTP versions come up in latency optimization, CDN configuration, and gRPC infrastructure questions.

**Key talking points:**
- HTTP/2 multiplexing removes need for domain sharding and aggressive bundling
- gRPC requires HTTP/2 — make sure infrastructure (ALB, proxy) supports it
- HTTP/3/QUIC is the answer to TCP HOL blocking — enable at CDN, not origin
- TLS 1.3 for security and speed — 1-RTT handshake

## Related topics

- [CDN](cdn.md) — HTTP/3 deployed at edge
- [gRPC](../api/grpc.md) — requires HTTP/2
- [Load Balancing](load-balancing.md) — ALB HTTP/2 support
- [Latency vs Throughput](../fundamentals/latency-throughput.md) — why protocol matters for latency
