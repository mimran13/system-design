# Evolutionary Architecture

Architecture is rarely "designed once, built once." Real systems are reshaped continuously — requirements change, scale changes, teams change, technologies obsolete. **Evolutionary architecture** is the discipline of building systems that absorb change without expensive rewrites. The term and most of the framing come from Neal Ford, Rebecca Parsons, and Patrick Kua's *Building Evolutionary Architectures*.

---

## The core idea

> Architecture should support **guided incremental change** across multiple dimensions.

Three pillars:

1. **Fitness functions** — automated tests that prevent architectural drift
2. **Incremental change** — small, low-risk modifications, not big rewrites
3. **Multiple dimensions** — performance, security, operability, not just functionality

A system without these decays. Each change makes the next change harder until rewrite seems easier than evolution.

---

## What goes wrong without it

```
Year 1: clean architecture, clear boundaries
Year 2: feature pressure → shortcuts in clean places
Year 3: shortcuts proliferate; clean architecture exists in name only
Year 4: nobody can change anything safely
Year 5: rewrite proposal — "we'll do it right this time"
Year 6: same shortcuts in the new code base
```

The cycle isn't inevitable. Teams that build for evolution from day one avoid it.

---

## Fitness functions as guardrails

Architecture rules in code, running in CI:

```python
def test_no_circular_dependencies():
    assert no_cycles_in("src/")

def test_domain_does_not_import_infrastructure():
    assert not imports("src/domain", "src/infrastructure")

def test_p99_under_200ms():
    result = run_benchmark()
    assert result.p99_ms < 200
```

When the architecture rule is automated, drift is detected the moment it happens. See [Fitness Functions](fitness-functions.md).

---

## Incremental change

Rewrite is the enemy of evolution. Strangler fig + small steps is the alternative.

### Strangler fig pattern

Replace gradually:

```
Phase 1:  New code wraps old code; both run side by side
Phase 2:  New code handles X% of traffic
Phase 3:  Slowly shift to 100% new
Phase 4:  Delete old code
```

Each phase is shippable. Each phase is reversible. See [Strangler Fig](strangler-fig.md).

### Branching by abstraction

When you need to change a deep dependency without breaking everything:

1. Introduce an abstraction in front of the old implementation
2. Create a second implementation behind the same abstraction
3. Swap behind the abstraction
4. Remove the old implementation

```python
# Step 1: extract interface
class StorageInterface:
    def get(self, key): ...
    def put(self, key, value): ...

class S3Storage(StorageInterface):
    # existing implementation moved here

# Step 2: new implementation
class GCSStorage(StorageInterface):
    # new implementation

# Step 3: switch via config
storage = S3Storage() if config.cloud == "aws" else GCSStorage()

# Step 4: remove S3Storage when GCS is verified everywhere
```

Each step is a small PR. Production never sees a big-bang switch.

### Feature flags

Decouple deploy from release. Code can ship without being active:

```python
if feature_flag("new_payment_pipeline", user=current_user):
    return new_pipeline.process(order)
return old_pipeline.process(order)
```

Roll out by percentage, by cohort, by region. Roll back instantly.

---

## Multiple dimensions

Architectural quality is multi-dimensional:

| Dimension | What it measures |
|---|---|
| Functional | Does the system do what it should? |
| Performance | Latency, throughput, resource usage |
| Security | Threat model coverage; vulnerability posture |
| Operability | Observability, on-call burden, deploy ease |
| Cost | $/request, infrastructure efficiency |
| Maintainability | Time to make a typical change |
| Scalability | Headroom under growth |
| Reliability | SLO compliance, failure handling |

A "good" architecture excels in *the dimensions that matter for this system*. Others can be acceptable.

For each, define a fitness function:

- **Performance**: p99 latency budget; CI benchmark fails on regression
- **Security**: Trivy/Snyk in CI; no critical vulns merge
- **Cost**: monthly cost trend; alert on anomaly
- **Maintainability**: dependency graph constraints
- **Scalability**: load test in pre-prod; throughput trends
- **Reliability**: SLO + error budget tracking

---

## Modularity is the enabler

Tight coupling kills evolution. To change one thing, you have to change everything that touches it.

```
Tightly coupled monolith:
  Changing the payment logic touches:
    - the order processor (calls payment directly)
    - the email service (reads payment status from DB)
    - the analytics pipeline (joins payment table)
    - the admin UI (renders payment fields)
  Each change risks breaking the others.

Modular system:
  Payment service exposes a stable API
  Other services depend on the API, not the implementation
  Internal payment changes don't ripple outside the service
```

Modularity at every level — code modules, services, data — bounds blast radius.

---

## Coupling: structural vs runtime

| Structural | Runtime |
|---|---|
| Static dependency between code | Dynamic call between running components |
| Compile-time / build-time | Runtime invocation |
| Mitigated by interfaces | Mitigated by async, schemas, contracts |

You can't fully eliminate coupling — services exist to talk to each other. The goal is to make it *visible* and *bounded*.

See [Coupling and Cohesion at Service Boundaries](coupling-cohesion-services.md).

---

## Architectural quanta

A "quantum" is the smallest unit of independently-deployable architecture. The unit you can change without coordinating with anyone.

```
Monolith:           1 quantum (whole app)
Microservices:      many quanta (one per service)
Modular monolith:   1 deploy quantum, many module quanta
```

Smaller quanta = more parallel evolution. But also more operational overhead. Pick based on the team and product.

---

## Continuous architecture practice

Architecture in evolutionary teams isn't a phase or a deliverable; it's a practice:

```
Weekly:    review fitness function results, check architectural drift
Monthly:   ADR retrospective — are decisions still valid?
Quarterly: architecture review — what's evolving, what's stuck?
Yearly:    revisit ADRs that are 2+ years old; supersede stale ones
```

The fitness functions feed each cycle. If a fitness function passes for 6 months, it's working. If it fails frequently, the rule may need adjustment or the code needs refactoring.

---

## When evolutionary fails

Evolutionary architecture works for:

- Incremental change (most product development)
- Performance and cost improvements
- Bug fixes and security patches

It struggles with:

- Paradigm shifts (monolith → microservices, sync → event-driven)
- Massive scale jumps (10× growth in 3 months)
- Vendor migrations (AWS → GCP)

For these, you need bigger steps — but even those can be broken down using strangler fig + abstraction patterns.

---

## Cultural prerequisites

Evolutionary architecture is a cultural practice, not just a tool:

- **Trust**: leadership trusts engineers to evolve, not just execute specs
- **Time**: capacity for refactoring, not just feature work
- **Tooling**: CI/CD that supports incremental change
- **Discipline**: writing ADRs, fitness functions, doing the slow path
- **Curiosity**: noticing when an old decision no longer fits

Without these, evolutionary architecture is a wishlist. With them, it's how engineers actually work.

---

## Anti-patterns

| Anti-pattern | What it produces |
|---|---|
| "We'll fix it later" | Permanent technical debt |
| Big-bang rewrites | Two architectures running simultaneously, neither good |
| ADRs as paperwork | Decisions documented but not enforced |
| Fitness functions as red tape | Engineers disable them |
| Architecture as one person's job | Bottleneck and bus factor |
| No allocation for refactoring | Architecture cannot evolve, only accumulate |

---

## Practical guidance

```
1. Write ADRs for non-trivial decisions.
2. Pair every ADR with a fitness function if automation is possible.
3. Build in feature flags from the start.
4. Use strangler fig for any change that touches old code.
5. Allocate ~20% capacity for refactoring + evolution work.
6. Review fitness function failures in retros — they're early signals.
7. Treat coupling as a first-class metric to track.
8. Avoid big-bang rewrites; if needed, deliver incrementally.
9. Architect for multiple dimensions; don't optimise only for "make it work."
10. Revisit old ADRs periodically; supersede when conditions change.
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you've been on a team that handled architectural change well — or one that hit a wall.

**Strong answer pattern:**
1. Build for change: fitness functions + strangler fig + feature flags + modular boundaries
2. Multiple dimensions matter: perf, security, cost, ops — not just features
3. Capture decisions in ADRs; enforce via fitness functions when possible
4. Avoid big-bang rewrites; deliver incrementally even for paradigm shifts
5. Architecture is a practice, not a deliverable — weekly attention, not yearly review

**Common follow-up:** *"How do you handle a needed architectural change in a tightly-coupled legacy system?"*
> Strangler fig. Introduce an abstraction in front of the old subsystem; build the new behind the same abstraction. Run both side by side. Shift traffic gradually with feature flags. Remove the old implementation when the new is verified. The whole change is many small PRs over weeks or months — never a single big-bang switch. Slow but reversible at every step.

---

## Related topics

- [ADRs](adrs.md) — capturing decisions
- [Fitness Functions](fitness-functions.md) — enforcing them
- [Strangler Fig](strangler-fig.md) — incremental migration
- [Modular Monolith](modular-monolith.md) — modularity without microservices
- [Coupling & Cohesion at Service Boundaries](coupling-cohesion-services.md) — what to manage
