# Architecture Anti-Patterns

Pattern names tell you what to do; anti-patterns name what you've already done wrong. Recognising them early — in your own system or in interviews — saves years of cleanup. This page catalogues the most common architectural anti-patterns, what they look like, and the standard fixes.

---

## You'll see this when...

- Cross-service deploys are coordinated events, not independent
- Every PR touches multiple services / repos
- Onboarding a new engineer takes 6+ months
- Services share a database (the most common smell)
- Tech stack chosen by what was popular at conferences
- 10-person team running 30 microservices, drowning in operational work
- One service has accreted 50+ tables from various concerns
- "We rewrote it in $LANG and it's worse" — pattern of rewrites
- Postmortems repeatedly cite "coupling between A and B" but nothing changes

---

## Distributed monolith

The most famous and most painful. You split a system into services but didn't reduce coupling.

### Symptoms

- Services share a database
- One service's deploy requires others to redeploy
- Synchronous request chains 5+ services deep
- A single feature touches many services
- "Microservices" but coordination effort exceeds monolith

### Root cause

Splitting along technical boundaries (frontend/backend/db) instead of business boundaries (bounded contexts).

### Fix

- Identify true boundaries via domain analysis
- Each service owns its data
- Replace sync chains with async events where possible
- Sometimes: **merge services back together**

> "The first rule of distributed objects: don't distribute your objects." — Martin Fowler

---

## Big ball of mud

No discernible architecture. Everything depends on everything. Changes ripple unpredictably.

### Symptoms

- "What does this module do?" → can't answer
- Every change breaks something distant
- Onboarding takes 6+ months
- Tests are integration-only because logic is spread everywhere

### Root cause

No architecture investment over years. Time pressure + churn + nobody owns the structure.

### Fix

- Slow, sustained refactoring; not a rewrite
- Establish module boundaries (folders → enforced via tooling)
- Strangler fig migration toward [modular monolith](modular-monolith.md)
- Add [fitness functions](fitness-functions.md) to prevent further drift

---

## Vendor lock-in

Architecture so tied to a specific vendor that switching is impractical.

### Symptoms

- Heavy use of vendor-proprietary APIs (DynamoDB-only patterns, Cosmos-only queries)
- Application logic mixed with vendor-specific abstractions
- Migration estimate is "rewrite everything"
- Pricing increases hurt because you can't move

### Root cause

Choosing convenient managed services without considering portability cost. Or "we'll abstract later" that never happens.

### Fix

- **Hexagonal architecture**: vendor APIs behind adapters; domain logic doesn't import vendor SDKs directly
- Use open standards where possible (Postgres protocol, S3 API, OCI containers)
- Be honest about lock-in: sometimes it's worth it (lots of value from one vendor); sometimes it isn't

This is a trade-off, not always wrong. Document the trade-off explicitly via an [ADR](adrs.md).

---

## Inappropriate intimacy (between services)

One service knows too much about another's internals.

### Symptoms

- Service A reads Service B's tables directly
- Service A's code depends on B's specific column names
- Schema changes in B require coordinated changes in A
- Performance issues in B's queries hurt A

### Root cause

"It's faster than calling B's API" thinking. Or starting with shared DB and never splitting.

### Fix

- Each service owns its tables; others access via API
- For read-heavy needs, A maintains a read replica from B's events
- Migrate via [strangler fig](strangler-fig.md): introduce API; move A from direct DB to API; eventually remove direct DB access

See [Coupling and Cohesion at Service Boundaries](coupling-cohesion-services.md).

---

## God service

One service does too much. The "common" or "core" or "platform" service.

### Symptoms

- The service has 50+ tables
- 10+ teams contribute to it
- Schema is incoherent
- Deploys are coordinated, slow, scary
- Outages take down everything

### Root cause

Continuous accretion. Nobody pushes back on adding "just this one thing."

### Fix

- Identify bounded contexts within the god service
- Carve them out one at a time (strangler fig)
- Strict ownership of new boundaries
- Resist adding to the god service even after split — backsliding is common

---

## Premature microservices

Splitting into microservices before the team or product is ready.

### Symptoms

- 10-person team running 50 services
- Most service-to-service calls are within "this should have been one service"
- Deploy and operational tooling is the team's main work
- Features take weeks because coordination > implementation

### Root cause

"Microservices are best practice" cargo-culted from large-scale companies. Or résumé-driven architecture.

### Fix

- Modular monolith is the right starting point for most teams
- Earn microservices by hitting actual scale or org-size walls
- If you've already done this: merge tightly-coupled services back together

---

## Reverse pyramid (testing)

Lots of slow end-to-end tests; few unit tests. CI takes hours.

### Symptoms

- Test suite runs in 60+ minutes
- Flaky tests common; retries normalised
- "Just rerun, it usually passes"
- Engineers afraid to refactor due to test fragility

### Root cause

Tests added under pressure at the wrong layer. Easier to write "click button, check page" than "test logic in isolation."

### Fix

- Push tests down: most as unit, some integration, few e2e
- Refactor for testability — pure logic separated from I/O
- Quarantine flaky tests immediately; fix or delete
- See [Testing Strategies](../software-design/testing-strategies.md)

---

## Stovepipe / silo architecture

Each team builds independently; nothing reusable; same patterns reimplemented N times.

### Symptoms

- Auth implemented 5 different ways across teams
- N copies of "user service" with subtle differences
- Documentation says "see other team for X"
- Cross-team work is months of integration

### Root cause

No platform layer. No shared services. Strong team autonomy without coordination.

### Fix

- Platform team builds shared infrastructure (auth, observability, deploy)
- Common patterns extracted into libraries
- Service catalogues so teams discover existing capability
- Federated governance — not central control, but shared standards

This is the [data mesh](data-mesh.md) approach applied broadly.

---

## Two-headed deployment

Deploy requires coordinated changes across multiple services.

### Symptoms

- Deploys are scheduled events, not continuous
- "Need to deploy A and B together; can't ship just A"
- Deployment runbooks span multiple services
- Rollbacks affect multiple services

### Root cause

Tight schema coupling between services. Backward-incompatible changes shipped without versioning.

### Fix

- Always deploy services independently (decoupled)
- Backward-compatible API/event changes only
- Use feature flags for cross-service feature rollouts
- Versioning for breaking changes

---

## Cargo cult architecture

Adopting patterns because of brand recognition, not problem fit.

### Symptoms

- Microservices because Netflix
- Event sourcing because conference talk
- Kubernetes for a 3-person team
- Service mesh for 5 services
- GraphQL because frontend likes it (without solving a real problem)

### Root cause

Architecture decisions driven by trends, not requirements.

### Fix

- Document decisions via [ADRs](adrs.md): force articulating why
- "What problem does this solve for us?" must be answerable
- Borrow patterns; don't borrow architectures wholesale
- Resist novelty unless it earns its complexity

---

## Tightly-coupled deploy and release

Shipping new code = exposing new feature, with no separation.

### Symptoms

- Feature work blocks on deploy windows
- Rollback = rolling back the deployment
- Can't test in production
- Coordinated marketing + deploy

### Root cause

No feature flags. No canary deployments. No infrastructure for gradual rollout.

### Fix

- Feature flags decouple deploy from release
- Canary or blue/green deploys for risk mitigation
- See [Deployment Strategies](../cicd/deployment-strategies.md), [Progressive Delivery](../cicd/progressive-delivery.md)

---

## Synchronous everything

Every cross-service call is sync. Latency stacks; failures cascade.

### Symptoms

- Request fans out to 10+ services
- p99 latency = sum of every dependency's p99
- Outage in one service brings down many
- Hard to add new participants

### Root cause

Sync is the default; async requires more thought. Habit and short-term simplicity.

### Fix

- Identify which calls actually need to be sync (caller blocks on result)
- Move others to async events / queues
- Add caching for repeat lookups
- See [Choreography vs Orchestration](choreography-vs-orchestration.md)

---

## Snowflake servers

Servers configured by hand; nobody knows the exact state.

### Symptoms

- "Don't restart the build server; it's special"
- New environment takes weeks to set up
- Disaster recovery means rebuilding from notes
- Configuration drift between dev/staging/prod

### Root cause

No [IaC](../iac/index.md). Years of manual changes accumulated.

### Fix

- Codify infrastructure (Terraform, CDK)
- Re-create environments from code; replace snowflakes
- Treat servers as cattle, not pets — replace, don't fix

---

## "We'll fix it later"

Technical debt accumulates without ever being addressed.

### Symptoms

- TODOs from 2018 still in code
- "Quick fix" patterns proliferate
- Refactoring proposals always deprioritised
- Engineers leave because the codebase is unworkable

### Root cause

No allocation for debt repayment. Roadmap = features only.

### Fix

- Allocate ~20% capacity for tech debt / refactoring
- Track debt explicitly (issues, dashboards)
- Architecture review process that says no to "we'll fix it later"
- See [Evolutionary Architecture](evolutionary-architecture.md)

---

## Architecture by committee

No clear ownership; decisions require consensus from many; nothing ships.

### Symptoms

- Reviews drag on for weeks
- "Let's discuss in the next meeting"
- Junior engineers can't get a decision out
- Designs feel like compromises pleasing nobody

### Root cause

Excess governance. Ambiguous ownership. Lack of empowered architects.

### Fix

- Designated decision-makers per area
- ADRs propose; one person decides; team can debate but doesn't veto
- "Disagree and commit" culture
- Architecture Office Hours for fast feedback

---

## Resume-driven development

Engineers picking technologies for career enhancement, not problem fit.

### Symptoms

- "Let's rewrite this in Rust"
- Adopting cutting-edge tools that don't have community / docs
- Hard to hire because stack is exotic
- Maintenance impossible after key engineer leaves

### Root cause

Personal interests overriding product / business needs.

### Fix

- ADRs force articulation: "why this tech?"
- "Boring tech" preference for foundational systems
- Innovation budget separate from "important systems" budget
- Consider hiring difficulty in tech choices

---

## Premature optimisation

Architecture optimised for scale that never comes.

### Symptoms

- Sharded databases for 1000 users
- Microservices for 5 features
- Multi-region for 100 customers in one country
- Kafka for 10 events/day

### Root cause

"What if we get huge?" thinking dominates "what do we need now?"

### Fix

- Optimise for current scale + 1-2 years; revisit
- Default to boring + simple
- Architecture should be evolvable, not pre-built for hypothetical futures

> "Premature optimization is the root of all evil." — Knuth

---

## Single-team architecture

System designed assuming one team forever; doesn't scale to multi-team.

### Symptoms

- 50 engineers contributing to one codebase
- Every PR conflicts with others
- Reviews bottleneck on a few seniors
- Coordination overhead exceeds productive work

### Root cause

Architecture didn't grow with the org. What worked at 10 engineers fails at 50.

### Fix

- Split into modules with clear team ownership (modular monolith)
- Eventually split into services (microservices) when scale demands
- Conway's Law: organise teams around bounded contexts

---

## Ignoring the operability dimension

Architecture is "elegant" but impossible to run.

### Symptoms

- Outages take hours to diagnose
- Incidents happen at all hours; on-call burns out engineers
- Deploys are scary
- Logs are unstructured; metrics absent

### Root cause

[Quality attributes](quality-attributes.md) only cover features and performance. Operability not measured.

### Fix

- Treat operability as a first-class quality attribute
- Define SLOs; track error budgets
- Ensure observability before launch
- See [Observability](../observability/index.md)

---

## How to spot anti-patterns in interviews

When asked to design a system:

```
1. Listen for "all services share the database" → distributed monolith warning
2. Watch for "let's use Kubernetes/Kafka/Redis" without justification → cargo cult
3. Check whether quality attributes are discussed → if not, premature optimisation likely
4. Ask "what's the team size?" → solo and microservices = premature
5. Ask "how do you deploy?" → if "we redeploy everything together" = distributed monolith
```

These red flags help you ask the right follow-up questions.

---

## How to fix when you find them

```
1. Recognise — call it by name, in writing
2. Document the root cause — usually structural, not personal
3. Plan incremental migration — never big-bang rewrite
4. Use strangler fig + ADRs + fitness functions
5. Allocate time — anti-patterns took years to grow; won't disappear in a sprint
6. Track progress — "% of services with own DB" or similar metric
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you can recognise architectural smell — your own and others'.

**Strong answer pattern:**
1. Distributed monolith is the most common microservices failure
2. Cargo culting and premature optimisation are second-order failures
3. Anti-patterns recognized → fixed via strangler fig, ADRs, fitness functions
4. Don't rewrite; evolve incrementally
5. Match architecture to team size and product stage

**Common follow-up:** *"Your team is 5 people running 30 microservices. What's wrong?"*
> Almost certainly premature microservices. Coordination overhead at this team size dominates productive work — you're spending more time on inter-service contracts, deploys, observability, and on-call than on features. The fix is to merge services until the count matches the team's operational capacity. Probably end up with 3-5 services. The architecture must match the team's ability to run it; "right" depends on context.

---

## Related topics

- [Modular Monolith](modular-monolith.md) — antidote to premature microservices
- [Coupling & Cohesion at Service Boundaries](coupling-cohesion-services.md) — distributed monolith mechanics
- [Strangler Fig](strangler-fig.md) — fix without rewrite
- [Evolutionary Architecture](evolutionary-architecture.md) — preventing accumulation
- [ADRs](adrs.md) — force articulation of decisions
- [Quality Attributes](quality-attributes.md) — what to optimise for
