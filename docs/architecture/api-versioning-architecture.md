# API Versioning at the Architecture Level

API versioning is often presented as a tactical choice — URL vs header vs media type. At the architecture level, the question is bigger: how does your system handle change without breaking consumers, who owns the contract, and how do you keep the API surface coherent over years? This page focuses on the architectural framing.

For the tactical mechanics, see [API Versioning](../api/versioning.md).

---

## Why versioning is architectural

Once your API has external consumers (other teams, other companies, public clients), you've made a contract. The contract has consequences:

- Consumers bake the API shape into their code
- Breaking changes require migration on the consumer side
- You can't move faster than the slowest consumer can migrate

Versioning strategy determines:

- How fast you can evolve internally
- How long old shapes live
- How much complexity you carry
- Whether consumers feel respected or abused

These are architectural concerns, not tactical ones.

---

## The four positions on versioning

### 1. Strict semantic versioning per release

```
v1.0  → v1.1 (additive)  → v1.2 (additive) → v2.0 (breaking)
```

Every breaking change → major version. v1 keeps running until consumers migrate.

Used by: Stripe, Twilio, GitHub, AWS SDK.

Pros:
- Predictable for consumers
- Old versions can be supported for years
- Migration is "their pace, not yours"

Cons:
- Carrying multiple versions costs ongoing engineering
- Code paths diverge between versions
- Eventually requires hard sunset dates

### 2. No versioning, only additive changes

```
Schema evolves; old fields stay; new fields added.
"Don't break existing consumers."
```

Used by: GraphQL philosophy (deprecate, don't break), most internal APIs.

Pros:
- One API; no version sprawl
- Consumers always on "latest"
- No migration project

Cons:
- The schema grows over time; deprecated fields linger
- Some changes (renaming, restructuring) are impossible
- "Internal" APIs sometimes need this discipline too

### 3. Date-based versioning (Stripe style)

```
2024-01-15: API behaviour as of this date
2024-09-30: API behaviour as of this date
```

When a breaking change ships, it gets a new date. Consumers pin to a specific date; they upgrade explicitly.

Used by: Stripe (famously).

Pros:
- Many micro-versions; small migration steps
- Backward compatibility maintained per date
- Consumers control when they upgrade

Cons:
- Server must handle every version forever (or until sunset)
- Operational complexity grows with each version
- Version proliferation

### 4. Per-resource versioning

```
/v1/users
/v2/users      ← new
/v1/orders     ← unchanged
```

Different resources versioned independently. Migration happens piece by piece.

Pros:
- Don't force a global v1→v2 jump
- Stable parts stay stable
- Natural with per-team ownership

Cons:
- API as a whole loses coherence
- Hard to communicate "what version are you on?"

---

## Backward compatibility — the practical default

Almost all good APIs maintain backward compatibility. Versioning is the **escape hatch** for when compatibility is impossible.

**Backward-compatible changes** (don't need a version):

- Adding new endpoints
- Adding new optional fields to requests
- Adding new fields to responses
- Adding new optional query parameters
- Adding new error codes (clients should handle unknowns)

**Breaking changes** (need a version):

- Removing endpoints, fields, or parameters
- Renaming fields
- Changing field types
- Changing semantics of existing behaviour
- Adding new required parameters
- Restructuring response shape

The discipline: **never break, always add**. New shape behind a new version; old shape continues working.

---

## Internal vs external APIs

| | Internal (within org) | External (public / partners) |
|---|---|---|
| Consumers | Other services / teams | Customers, partners |
| Migration coordination | Possible (slack, doc) | Hard or impossible |
| Versioning need | Lower (can coordinate breaking changes) | High (no coordination) |
| Compatibility horizon | Months | Years |
| Sunset process | Just deprecate and move | Multi-quarter notice + comms |

External APIs need formal versioning. Internal APIs often get away with additive evolution + careful coordination.

But: even internal APIs grow consumers. Today's "internal API" becomes tomorrow's de facto contract with another team. Apply versioning discipline to anything more than 1-2 known consumers.

---

## Architectural patterns for evolution

### Tolerant reader

Consumers ignore unknown fields and tolerate missing optional ones:

```python
# BAD: brittle
order_status = response["status"]  # crashes if status missing

# GOOD: tolerant
order_status = response.get("status", "unknown")
```

When everyone is a tolerant reader, additive evolution doesn't need versioning. Most modern serialization formats (Protobuf, Avro) enforce this.

### Schema versioning

Each message carries a version number. Consumers handle multiple versions:

```python
def parse_event(event):
    if event["schema_version"] == 1:
        return parse_v1(event)
    elif event["schema_version"] == 2:
        return parse_v2(event)
    raise UnknownSchemaVersion()
```

Used in event-driven systems where events live in queues for a long time.

### Anti-corruption layer

When consuming a third-party or legacy API, wrap it in your own model:

```
External API ──► Anti-corruption layer ──► Your domain model
```

Their changes don't ripple into your code; the layer absorbs them. See [DDD: Tactical Patterns](../software-design/ddd-tactical.md).

### API gateway versioning

Single gateway routes by version → backend services:

```
/v1/users → users-service-v1
/v2/users → users-service-v2 OR users-service with v2 logic
```

Pros: clean separation; can run different versions on different infra. Cons: more deploys to coordinate.

---

## Sunset process

Old versions can't live forever. Sunset planning:

```
Phase 1 — Announce (T-12 months)
  - Documentation marked deprecated
  - Response includes Deprecation HTTP header
  - Email / blog post to consumers

Phase 2 — Track usage (T-12 to T-3)
  - Per-version request metrics
  - Identify still-active consumers
  - Outreach: "we see you using v1; please migrate"

Phase 3 — Final notice (T-3 months)
  - Stronger warnings; may require explicit opt-in to use v1
  - Schedule "brownouts" — short windows where v1 returns errors
  
Phase 4 — Sunset (T-0)
  - v1 returns 410 Gone
  - Documentation moved to /archive
```

Brownouts are an effective tool: an hour per week where v1 stops working forces consumers to test their migration. No surprises on the final cutover day.

---

## Per-domain versioning vs API-wide

| Approach | Implications |
|---|---|
| Single API version (v1, v2) | Coherent; coarse-grained migrations |
| Per-resource version | Fine-grained; less coherent |
| Per-event version (events) | Common in event-driven; granular |
| Hybrid (gateway version + service version) | Two layers of versioning |

GraphQL's stance: no versioning at the API layer at all. Schema evolves additively. Old fields deprecated, eventually removed.

REST tends toward URL versioning (`/v1/`). gRPC uses package versioning (`mypackage.v1.UserService`).

---

## Architecture decisions versioning forces

Adopting strict versioning means accepting:

1. **Multiple code paths in your services** to support multiple API versions
2. **Per-version testing** (don't break v1 while changing v2)
3. **Operational tracking** of which version each consumer is on
4. **Customer support** for version migration
5. **Release notes with migration guides** for breaking changes

These costs are real. Organisations that don't plan for them end up either:

- Locking themselves out of evolution (can't break anything)
- Breaking consumers anyway and dealing with the fallout

The architecturally honest answer: pick a versioning model and own its costs.

---

## Contract testing

Versioning is about contracts between you and consumers. **Contract testing** verifies the contract holds:

```
Consumer-driven contracts (CDC):
  Consumer says: "I expect endpoint X to return shape Y"
  Provider runs the consumer's contract against its build
  Provider's CI fails if contract broken
```

Tools: Pact, Spring Cloud Contract.

Without contract tests, "we didn't break anything" is hope, not fact. With them, you know.

---

## Versioning as cultural choice

The organisation's stance on versioning reveals its values:

- **Strict SemVer + long support**: respects external consumers, slow to evolve
- **Date-based + frequent versions**: respects consumers' choice of upgrade time
- **No versioning (additive only)**: respects own velocity; demands tolerant readers
- **Break things and apologise**: respects nobody; rare in mature orgs

Pick consistent with the relationship you want with consumers.

---

## Common mistakes

| Mistake | Consequence |
|---|---|
| Versioning at the wrong level (every endpoint) | Coordination nightmare |
| Never sunsetting old versions | Carrying ancient code forever |
| Sunsetting without notice | Customer trust collapse |
| No deprecation headers / metrics | Don't know who's using what |
| "We'll just break things; people deal with it" | Customer churn |
| Heavy versioning of internal APIs | Slows down own teams |
| No versioning for events / async messages | Stale consumers process old shapes wrong |

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you've operated APIs through real evolution, not just designed them v1.

**Strong answer pattern:**
1. Versioning strategy is architectural — affects velocity, ops cost, consumer relationship
2. Default to additive (backward compatible); version only for true breaking changes
3. Sunset process: deprecation header → metrics → outreach → brownouts → 410 Gone
4. Internal APIs: tolerant readers + coordination usually beat versioning
5. Public APIs: pick a model (SemVer / date-based / additive) and commit to it
6. Contract tests verify the contract holds

**Common follow-up:** *"You're adding a required field to a request. How do you do it without breaking consumers?"*
> Three steps. (1) Make the field optional in the API contract. Server treats it as required for new consumers but accepts requests without it for old ones (with a default value or rejection of the corresponding new functionality only). (2) Add deprecation header on requests missing the field. Track usage. (3) When usage hits zero — or at the planned sunset date — make the field truly required and bump the version. The field went from "nonexistent" to "optional" to "required-via-version-2" without ever breaking active consumers.

---

## Related topics

- [API Versioning](../api/versioning.md) — tactical patterns
- [API-First Design](api-first.md) — design before implementation
- [Microservices Patterns](microservices-patterns.md) — service evolution
- [Evolutionary Architecture](evolutionary-architecture.md) — broader change discipline
- [Webhooks](../api/webhooks.md) — versioning outbound webhooks
