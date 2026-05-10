# Edge Architecture

Edge architecture pushes compute and data **as close to users as possible** — beyond regional cloud datacenters, out to CDN points-of-presence (PoPs) or specialised edge locations. Done right, it cuts latency from 100ms to 10ms for global users without the cost and complexity of full multi-region. Done wrong, it adds operational complexity for marginal benefit.

---

## The hierarchy of "where computing happens"

```
Browser/device:       0 ms     limited resources
Edge (CDN PoP):       5-30 ms  thousands of locations globally
Region (cloud DC):    30-200 ms major locations
Global region:        100-300 ms cross-continent
```

Each level offers different trade-offs of latency vs capability vs cost. Edge sits between client devices and regional clouds.

---

## What "edge compute" can do

Modern edge platforms (Cloudflare Workers, Lambda@Edge, Vercel Edge, Fastly Compute, Akamai EdgeWorkers) run code at the CDN edge. Capabilities:

- HTTP request/response transformation
- Authentication / authorization
- Geographic routing
- A/B test variant assignment
- Personalization
- Form handling, simple APIs
- Bot mitigation
- Image transformation
- Header manipulation

Constraints:

- Short execution time (typically <50ms CPU per request)
- Limited memory (~128MB)
- Restricted runtime (V8 isolates or WebAssembly, not full Node.js)
- Limited storage (KV stores with eventual consistency)
- No long-lived connections (websockets vary by platform)

Edge isn't general-purpose compute. It's a tightly constrained environment optimised for fast HTTP request handling.

---

## When edge fits

```
✓ Latency-sensitive HTTP requests
✓ Geographic personalization (language, currency, region-specific content)
✓ Simple transformations on requests/responses
✓ Authentication / authorization at the edge
✓ Static + dynamic personalization (mostly cached, some per-user)
✓ Bot detection / DDoS mitigation
✓ A/B testing / feature flag evaluation

✗ Heavy computation (video transcoding, ML inference of large models)
✗ Long-running operations
✗ Strong consistency requirements
✗ Stateful applications (chat, gaming sessions — though some platforms try)
✗ Complex backend logic that needs full database access
```

---

## Concrete examples

### 1. Auth at the edge

```javascript
// Cloudflare Worker
export default {
  async fetch(request, env) {
    const cookie = request.headers.get('cookie');
    const session = parseSessionCookie(cookie);
    
    if (!session) {
      return Response.redirect('https://example.com/login');
    }
    
    // Validate session against KV store at edge
    const user = await env.SESSIONS.get(session.id, 'json');
    if (!user) return new Response('Unauthorized', { status: 401 });
    
    // Forward to origin with user context
    const origin = await fetch(request, {
      headers: { ...request.headers, 'X-User-Id': user.id },
    });
    return origin;
  }
};
```

User auth checked at PoP; unauthorized requests never reach origin. Latency drop: ~80ms saved on rejections.

### 2. Personalization

```javascript
// At the edge, look up the user's segment from edge KV
const segment = await env.USER_SEGMENTS.get(userId);

// Fetch the page from origin (or edge cache)
const page = await fetch(originUrl);
let html = await page.text();

// Inject segment-specific content
html = html.replace('{{cta}}', getCtaForSegment(segment));

return new Response(html, page);
```

Origin sees one page; edge personalizes per request.

### 3. A/B test bucketing

```javascript
const cookie = parseCookie(request);
const variant = cookie.ab_test_variant || assignVariant(userId, "checkout_v2");

if (variant === "B") {
  return fetch("https://origin/checkout-v2");
}
return fetch("https://origin/checkout");
```

Variant decided at edge; origin doesn't see the bucket logic.

### 4. Geographic routing

```javascript
const country = request.cf.country;  // Cloudflare provides geo info
const region = country === "CN" ? "ap-east-1" : "us-east-1";
return fetch(`https://${region}-api.example.com${request.path}`);
```

User's country drives backend selection.

### 5. Image transformation

```javascript
// /image/abc.jpg?w=400 → resize on the edge
const params = new URL(request.url).searchParams;
const width = params.get("w");
const original = await fetch(getOriginUrl(request));
const resized = await imageResize(original, { width });
return new Response(resized);
```

Origin stores one master image; edge serves variants. Saves origin compute and storage.

---

## Edge state

Most edge platforms offer some persistent storage:

| Platform | Storage |
|---|---|
| **Cloudflare Workers** | KV (eventually consistent), Durable Objects (strongly consistent), D1 (SQL) |
| **Lambda@Edge / CloudFront** | None directly; call back to regional storage |
| **Vercel Edge** | KV, edge config, blob storage |
| **Fastly Compute** | Config store, KV store |

Properties:

- **Globally distributed**: same key reads from nearest edge node
- **Eventually consistent**: writes propagate in seconds
- **Best for read-heavy data**: feature flags, configuration, user profiles
- **Not for transactional writes**: regional database still owns those

Common pattern: **read at edge, write at regional**. Edge fetches the latest profile from a regional API on cache miss; subsequent edge reads are fast.

---

## CDN as the foundation

Edge compute runs **on the CDN's infrastructure**. The CDN was already there for static asset delivery; edge compute extends it.

A typical request flow:

```
1. User requests https://example.com/api/feed
2. DNS routes to nearest CDN PoP
3. PoP runs edge worker
4. Worker checks cache, calls origin if needed
5. Origin (regional) responds
6. Worker may transform, log, cache, then return to user
```

Edge compute is **request-scoped**: short execution, fast response, no long-lived state.

---

## Edge KV vs origin database

```
Origin DB (Postgres, DynamoDB):
  Strong consistency
  Expressive queries
  ~10-100ms cross-continent latency

Edge KV (Cloudflare KV, Vercel KV):
  Eventual consistency (5-60s propagation)
  Key-value only
  <5ms read latency at any PoP
```

Use both: origin DB for source of truth; edge KV for read-heavy, latency-sensitive lookups. Update edge KV from origin when data changes.

---

## Edge vs full multi-region

| | Edge | Multi-region |
|---|---|---|
| Locations | 100s-1000s of PoPs | Few regions (3-10 typical) |
| Compute | Tightly constrained | Full cloud capabilities |
| Storage | Limited KV-class | Full databases |
| Cost model | Per-request, generous | Per-resource, expensive |
| Latency | 5-30ms anywhere | 30-100ms for users near regions |
| Best for | Stateless transformations, auth, personalization | Full applications with regional residency |

They compose:

```
User → Edge (auth, personalization, cache) → Regional cloud (full app) → Database
```

Edge handles fast paths; regional handles the heavy lifting. This is how modern global products are built.

---

## Use cases by industry

### E-commerce

- Personalize hero section based on geography / segment
- Auth + cart at edge
- Image transformation per device size
- Cart-abandonment detection

### Media / publishing

- Paywall enforcement at edge
- Geo-restricted content blocking
- A/B test variant assignment
- Subscription validation

### B2B SaaS

- Tenant routing (custom domain → tenant slug)
- API key auth
- Region-aware request routing
- Rate limiting per customer

### Gaming

- Match-making lookups
- Session validation
- Anti-cheat fingerprint checks

### Finance

- Bot detection
- Authentication
- Geographical compliance (block restricted countries)

---

## Edge databases

Pure edge databases are emerging:

| Tool | Notes |
|---|---|
| **Cloudflare D1** | SQLite at the edge; replicated globally |
| **Cloudflare Durable Objects** | Strongly consistent, single-region per object |
| **Turso** | Global SQLite |
| **Fauna** | Globally distributed, ACID |
| **PlanetScale** | MySQL-compatible with global read replicas |

These solve "I want a database that's fast everywhere" but with caveats: writes are still slow somewhere; consistency models vary.

---

## Cost model

Edge compute pricing is typically:

```
Per request: $0.0000005 - $0.000001
Per CPU-ms: $0.0000125 (Workers paid)
Storage: $0.50/GB-month (KV)
```

For a high-traffic product, edge costs can be much lower than equivalent regional compute (no idle servers, scales to zero). But for compute-heavy operations, regional compute is cheaper per unit work.

---

## Operational considerations

### Deployment

Edge deploys propagate to thousands of PoPs in minutes. Modern platforms (Workers, Vercel) deploy in seconds globally.

Implication: rollback is fast but the same speed creates risk. Use feature flags + gradual rollout.

### Observability

- Logs from N PoPs aggregate to a central destination
- Latency varies wildly by user location; capture geo
- Cold starts at low-traffic PoPs (V8 isolates fast; Wasm faster)

### Testing

Hard to fully test "edge in N locations." Most platforms provide local emulators (`wrangler dev`, `vercel dev`). Use staging environments for production-like edge behaviour.

### Debugging

Distributed tracing across edge → regional → database is essential. Without it, "why is this user's request slow?" is impossible to answer.

---

## Limitations

```
1. Execution budget per request
   Workers: 50ms CPU (paid plan); strict cap
   Lambda@Edge: 5 seconds; longer than Workers but still bounded
   Implication: keep edge code lean

2. Memory limits
   Typically 128MB; can't load large ML models or process large files

3. Limited node modules
   Edge runtimes (V8 isolates, Wasm) don't run all Node.js code
   Some npm packages unavailable

4. State scarcity
   KV is eventually consistent; Durable Objects are per-object;
   no multi-key transactions across edge

5. Regional dependencies
   Edge code often calls back to regional APIs/DBs
   That call's latency dominates if needed every request
```

---

## Anti-patterns

| Anti-pattern | Problem |
|---|---|
| Heavy compute at edge | Cold starts, timeouts, cost |
| Synchronous regional call on every edge invocation | Latency stays bad; edge gives no benefit |
| Stateful logic at edge expecting strong consistency | Eventually-consistent stores fail expectations |
| Edge as the only layer (no origin) | Can't store much; can't run complex logic |
| Replicating database to edge KV in real time | Eventual consistency lag; race conditions |
| Different code paths at edge vs origin | Maintenance hell; behavioral drift |

---

## Decision: edge or regional?

```
Question: What gives this user a faster response?

If "smaller payload after personalization" → edge transformation
If "auth check that's mostly negative" → edge auth
If "cached response with personalization touch" → edge fetch + transform
If "complex business logic with database" → regional, possibly with edge cache
If "real-time updates / websockets" → regional (or specialised edge platforms)
If "heavy compute" → regional
```

Don't put logic at the edge that doesn't benefit from being there.

---

## Architectural pattern: hybrid

The most common shape:

```
User → Edge (auth, cache, personalize) → Regional API → Regional DB → Async to global event stream
                                                              ↓
                                                         Updates push to edge KV (eventual)
```

Edge handles fast paths and personalization. Regional handles heavy lifting. Edge KV keeps frequently-needed data close to users with eventual consistency.

This pattern is *the* modern web architecture. Most large web products look something like this.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you can match latency requirements to deployment topology — not just "use a CDN."

**Strong answer pattern:**
1. Edge sits between user and regional cloud; tight runtime, broad geographic reach
2. Use for stateless transformations: auth, personalization, routing, simple APIs
3. Edge state via KV (eventual consistency) or Durable Objects (per-object strong)
4. Compose with regional: edge for fast paths, regional for heavy logic
5. Cost is per-request; scales to zero; cheap until compute-heavy
6. Constraints (50ms CPU, 128MB memory) shape what fits

**Common follow-up:** *"What's the difference between an edge worker and a regional Lambda?"*
> Three things. (1) Location: edge runs at hundreds-of-thousands of PoPs; Lambda runs in regional datacenters. (2) Runtime: edge typically uses V8 isolates or WebAssembly with tight constraints (50ms CPU, 128MB memory); Lambda has full Node.js / Python / etc. with multi-second timeouts and gigabytes of memory. (3) Cost model: edge is per-request, scales to zero, cheap; Lambda is per-100ms billed, more expensive but can do heavier work. Use edge for fast HTTP transformations; Lambda for everything that doesn't fit edge constraints.

---

## Related topics

- [CDN](../networking/cdn.md) — the underlying infrastructure
- [Multi-Region Architecture](multi-region.md) — broader global deployment
- [Serverless Architecture](serverless.md) — related model at the regional layer
- [API Gateway](../networking/api-gateway.md) — often at the edge
- [TLS and Certificates](../fundamentals/tls-certificates.md) — TLS termination at edge
