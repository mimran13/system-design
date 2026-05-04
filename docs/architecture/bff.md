# Backend for Frontend (BFF)

## What it is

Backend for Frontend is an architectural pattern where you create a dedicated backend service for each distinct frontend client (web, mobile, third-party). Instead of one general-purpose API that tries to serve all clients, each client gets an API shaped exactly to its needs.

```
WITHOUT BFF — one API, all clients:

  Web App   ──┐
  iOS App   ──┼──► General API ──► Microservices
  Android   ──┤
  Partners  ──┘

Problems:
  - API is a compromise — too much data for mobile, too little for web
  - Adding a mobile-specific field risks breaking the web contract
  - All clients get the same response shape regardless of what they need
  - A mobile change requires negotiating with the web team (same API)


WITH BFF — one backend per client type:

  Web App   ──► Web BFF     ──┐
  iOS App   ──► Mobile BFF  ──┼──► Microservices / Core APIs
  Android   ──► Mobile BFF  ──┤
  Partners  ──► Partner BFF ──┘

Each BFF:
  - Speaks the client's language (shape, payload size, auth method)
  - Owned by the same team as the frontend
  - Evolves independently
```

---

## The problem it solves

Different clients have fundamentally different needs from the same underlying data:

```
Product detail page:

Web (large screen, fast network):
  Full product description + specs
  40 related products with images
  All 200 reviews with pagination
  Seller info + 20 seller products
  Price history chart data
  → 50KB response is fine

iOS (small screen, mobile network):
  Product name, price, main image only
  5 related products (thumbnails)
  3 top reviews
  → 5KB response needed, battery matters

Partner API (3rd party integration):
  Structured data: SKU, price, stock level
  No UI-specific fields
  Different auth (API key, not session)
  Strict versioning contract
```

One API forced to serve all three means:
- Mobile gets 50KB when it needs 5KB → slow, battery drain
- Web has to make 4 separate API calls because the API is too granular
- Partners are affected when the web team adds a new field

---

## Structure

### Web BFF

```python
# web_bff/routes/product.py
@router.get("/products/{product_id}")
async def get_product_detail(product_id: str):
    # Fan-out to multiple backend services in parallel
    product, reviews, related, seller = await asyncio.gather(
        product_service.get(product_id),
        review_service.get_reviews(product_id, limit=200),
        recommendation_service.get_related(product_id, limit=40),
        seller_service.get_seller(product_id),
    )
    
    # Compose the response shaped for web
    return {
        "product": {
            "id": product.id,
            "name": product.name,
            "description": product.full_description,  # full text
            "specs": product.specifications,           # all specs
            "price": product.price,
            "images": product.all_images,              # all images
            "price_history": await get_price_history(product_id),
        },
        "reviews": {
            "total": reviews.total,
            "items": reviews.items,    # all reviews, client paginates
        },
        "related_products": related.items,   # 40 items
        "seller": {
            "id": seller.id,
            "name": seller.name,
            "rating": seller.rating,
            "products": seller.recent_products[:20],
        }
    }
```

### Mobile BFF

```python
# mobile_bff/routes/product.py
@router.get("/products/{product_id}")
async def get_product_detail(product_id: str):
    # Fewer parallel calls — mobile needs less
    product, top_reviews = await asyncio.gather(
        product_service.get(product_id),
        review_service.get_reviews(product_id, limit=3, sort='top'),
    )
    
    # Leaner response shaped for mobile
    return {
        "id": product.id,
        "name": product.name,
        "tagline": product.short_description,  # short text only
        "price": format_price(product.price),  # formatted string: "$29.99"
        "image": product.primary_image,        # ONE image, pre-sized
        "rating": product.average_rating,
        "review_count": product.review_count,
        "top_reviews": [
            {"author": r.author_name, "text": r.text[:100], "rating": r.rating}
            for r in top_reviews.items
        ],
        "cta": {                               # mobile-specific: call-to-action
            "label": "Add to Cart",
            "deeplink": f"app://cart/add/{product.id}"
        }
    }
```

### Partner BFF

```python
# partner_bff/routes/product.py
@router.get("/v1/products/{sku}")
async def get_product(sku: str, api_key: str = Header(...)):
    validate_api_key(api_key)   # partner uses API key, not session
    
    product = await product_service.get_by_sku(sku)
    
    # Structured, stable schema — partners depend on this contract
    return {
        "sku": product.sku,
        "name": product.name,
        "price_usd": str(product.price),    # string to avoid float precision
        "stock_status": product.stock_status,  # "in_stock" / "out_of_stock"
        "category": product.category_code,
        "_links": {
            "self": f"/v1/products/{sku}",
            "inventory": f"/v1/inventory/{sku}",
        }
    }
    # No UI fields, no recommendations, no reviews — not partner's concern
```

---

## Key design decisions

### One BFF per client type, not per client

```
WRONG (too granular):
  iOS BFF
  Android BFF    ← iOS and Android usually have the same needs
  iPad BFF       ← Unnecessary

RIGHT:
  Mobile BFF    ← handles iOS + Android (same response shape)
  Web BFF       ← handles desktop browser
  Partner BFF   ← handles external integrations
```

### Who owns the BFF?

The **frontend team owns their BFF**. This is the key benefit:

```
Web team owns:
  - React/Next.js frontend
  - Web BFF        ← same team, no cross-team API negotiation

Mobile team owns:
  - iOS/Android app
  - Mobile BFF     ← same team

Backend platform team owns:
  - Core microservices (Product, Order, Review, etc.)
  - Partner BFF (if it's an external-facing API product)
```

This eliminates the "API team as gatekeeper" bottleneck. The web team needs a new field? They add it to their BFF without a ticket to the API team.

### What goes in the BFF

```
BFF responsibilities:
  ✓ Request aggregation (fan-out to multiple services)
  ✓ Response shaping (filter, rename, reformat for the client)
  ✓ Client-specific auth handling (session vs token vs API key)
  ✓ Protocol translation (REST → gRPC to backend services)
  ✓ Error formatting (mobile wants different error shapes than web)
  ✓ Rate limiting per client type
  ✓ Client-specific caching

BFF is NOT:
  ✗ Business logic (that belongs in core services)
  ✗ Database access (BFF talks to services, not DBs)
  ✗ Source of truth for any data
```

---

## BFF and GraphQL

GraphQL is often used as an alternative to BFF — clients query exactly what they need:

```graphql
# Mobile client queries only what it needs
query ProductMobile($id: ID!) {
  product(id: $id) {
    name
    price
    primaryImage
    rating
  }
}

# Web client queries more
query ProductWeb($id: ID!) {
  product(id: $id) {
    name
    price
    fullDescription
    specs
    allImages
    reviews(limit: 200) { ... }
    relatedProducts(limit: 40) { ... }
  }
}
```

**GraphQL vs BFF trade-offs:**

| | BFF | GraphQL |
|---|---|---|
| Response shaping | Done server-side (BFF) | Done client-side (query) |
| Over-fetching | Eliminated by BFF design | Eliminated by query |
| Under-fetching | Eliminated by aggregation | Eliminated by query |
| Caching | HTTP cache works well | HTTP caching harder (POST queries) |
| Auth per client | Natural (separate BFF) | Requires directive/resolver logic |
| Team ownership | Clear (frontend team owns BFF) | Shared schema — coordination needed |

**BFF + GraphQL together:** Each BFF exposes its own GraphQL API. The mobile BFF's GraphQL schema only includes mobile-relevant fields.

---

## When to use BFF

**Good fit:**
- Multiple distinct client types with different data needs (web + mobile + partners)
- Frontend teams need to move fast without API team bottlenecks
- Clients are on very different network conditions (mobile vs broadband)
- Different authentication mechanisms per client
- Clients need aggregated data from multiple services

**Overkill:**
- Single client type (only a web app, no mobile)
- Tiny team — operational overhead of multiple BFFs isn't worth it
- Simple CRUD — if the API shape fits all clients already
- Very early stage — add BFF when the pain of a single API is felt, not before (YAGNI)

---

## AWS architecture

```
Clients:
  Browser ──────────────────────────────────────────┐
  Mobile App ────────────────────────────────────────┤
  Partner ────────────────────────────────────────────┤
                                                     ▼
                                              CloudFront (CDN)
                                                     │
                                         ┌───────────┼────────────┐
                                         ▼           ▼            ▼
                                     Web BFF     Mobile BFF   Partner BFF
                                  (ECS/Lambda) (ECS/Lambda) (API Gateway)
                                         │           │            │
                              ┌──────────┴───────────┴────────────┘
                              │         (internal network)
                              ▼
                    Core Microservices
                  (Product, Order, Review, Inventory, ...)
                    (ECS / Lambda / Kubernetes)
```

---

## Interview talking points

!!! tip "Key things to say"
    1. BFF solves the "API as a compromise" problem — mobile gets a lean response, web gets a rich one
    2. Team ownership is the real win — frontend teams control their own destiny without API team bottlenecks
    3. BFF is not where business logic lives — it's an aggregation and translation layer
    4. GraphQL is an alternative, not always better — HTTP caching breaks with GraphQL, and per-client auth is harder
    5. Introduce BFF when you feel the pain of a single API serving different clients — not before

## Related topics

- [API Gateway](../networking/api-gateway.md) — API Gateway sits in front of BFFs
- [Monolith vs Microservices](monolith-vs-microservices.md) — BFF is a natural evolution when splitting
- [REST](../api/rest.md) — each BFF typically exposes REST to its client
- [GraphQL](../api/graphql.md) — alternative to BFF for flexible queries
