# Fitness Functions

Architecture rots. Module boundaries blur, dependencies sneak across layers, performance regressions slip in. **Fitness functions** are automated checks — built into CI or runtime — that verify the architecture stays aligned with its goals. The term comes from Neal Ford and the *Building Evolutionary Architectures* book; the practice is older but underused.

---

## What a fitness function is

A test that runs continuously and **fails when the architecture violates a rule**.

```
Goal:           "Modules in domain/ must not depend on infra/"
Fitness fn:     dependency-graph check in CI
Failure mode:   PR is blocked from merging
```

The architecture rule lives in code, not in a wiki page that everyone forgets.

---

## Categories

### Atomic vs holistic

| Category | Scope |
|---|---|
| **Atomic** | Single component property (e.g., this service's p99 latency) |
| **Holistic** | System-wide property (e.g., total deploy time across all services) |

### Triggered vs continual

| Category | When it runs |
|---|---|
| **Triggered** | On PR / on schedule / on deploy |
| **Continual** | Always running (production check, dashboard alert) |

### Static vs dynamic

| Category | Mechanism |
|---|---|
| **Static** | Code analysis without running anything |
| **Dynamic** | Tests, load tests, production probes |

Most fitness functions are atomic + triggered + static — checks that run in CI on every PR.

---

## Examples

### 1. Module dependency rules

```python
# tests/test_architecture.py
from architecture_check import depends_on

def test_domain_does_not_depend_on_infra():
    assert not depends_on(module="src/domain", on="src/infra")

def test_no_circular_dependencies():
    assert no_cycles_in("src/")
```

Tools: ArchUnit (Java), `archunit-test-tool`, `dependency-cruiser` (JS), `graphq` / `pydeps` (Python), Rust's `cargo-modules`.

```java
// ArchUnit example (Java)
@Test
void domainShouldNotDependOnInfrastructure() {
    classes()
        .that().resideInAPackage("..domain..")
        .should().onlyDependOnClassesThat()
        .resideOutsideOfPackage("..infrastructure..")
        .check(importedClasses);
}
```

### 2. Performance regression

```yaml
# CI step
- name: Benchmark
  run: |
    go test -bench=. -benchmem > current.txt
    benchstat baseline.txt current.txt | tee benchstat.txt
    if grep "+[0-9]\+%.*slower" benchstat.txt; then exit 1; fi
```

Detects 10%+ slowdowns. Regression = PR blocked.

### 3. API compatibility

```bash
# Detect breaking API changes
buf breaking --against '.git#branch=main'
```

Buf, OpenAPI Diff, JSON Schema Diff — all check whether the API contract changed in a backward-incompatible way.

### 4. Service-level latency budget

```promql
# Alert continually if any service violates SLO
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)
) > 0.5
```

A continual fitness function: if a service's p99 stays above 500ms, the architecture isn't meeting its non-functional requirement.

### 5. Resource consumption

```yaml
- name: Image size budget
  run: |
    size=$(docker image inspect myapp:${{ github.sha }} --format='{{.Size}}')
    if [ "$size" -gt 524288000 ]; then
      echo "Image exceeded 500MB"
      exit 1
    fi
```

Bloated dependencies caught in CI, not at deploy.

### 6. Security posture

```yaml
- uses: aquasecurity/trivy-action@master
  with:
    severity: CRITICAL,HIGH
    exit-code: '1'
```

Architecture rule: "no critical vulnerabilities ship to production." Encoded as CI gate.

### 7. Documentation freshness

```bash
# Check that every public API is documented
ruff check --select D src/

# Check that ADRs exist for major decisions
test -f docs/adrs/0001-*.md || exit 1
```

### 8. Test coverage threshold

```bash
pytest --cov=src --cov-fail-under=80
```

A blunt instrument but a recognised fitness function: "we maintain at least 80% coverage."

### 9. Naming conventions

```python
def test_all_repository_classes_end_with_repository():
    for cls in find_classes("src/repositories/"):
        assert cls.__name__.endswith("Repository")
```

Useful for large codebases where conventions slip.

### 10. Service-to-service contract testing

Pact, Spring Cloud Contract — verify every consumer/provider pair stays compatible.

```yaml
- name: Pact verify
  run: |
    pact-broker can-i-deploy \
      --pacticipant order-service \
      --version ${{ github.sha }} \
      --to-environment production
```

Returns true only if all consumers' contracts pass against this version. Holistic fitness function — checks the whole system.

---

## Where they live

```
Continuous integration:        unit tests, lint, deps, perf
Continuous deployment:         contract tests, smoke tests
Production runtime:            SLOs, health checks, anomaly detection
Periodic batch:                cost analysis, drift detection, security scans
```

Layered defense: catch in CI when possible, in CD when CI can't, in production as last line.

---

## How they're different from regular tests

| | Unit / integration test | Fitness function |
|---|---|---|
| What it checks | Code correctness | Architectural property |
| Failure means | Bug | Architecture violation |
| Granularity | A function or feature | A system rule |
| Lifespan | Test lives with the code it tests | Lives across many features |

Unit tests check behaviour; fitness functions check structure and non-functional requirements.

---

## Designing good fitness functions

### Start with the architecture decision

```
Decision (ADR-0017): "All write operations go through the order service."
Fitness function:    no other service has DB credentials for the orders DB.
Implementation:      check IAM policies in CI.
```

The ADR drives the fitness function. The fitness function enforces the ADR mechanically.

### Fail loud, fail early

A fitness function that runs nightly and creates a Jira ticket fails too late. Run on every PR; block merges. The closer to the decision, the cheaper to fix.

### Make violations easy to fix

```
✗ "Architectural violation. See docs/architecture-rules.md."
✓ "Module orders/ depends on infra/db.py at line 42. 
   Move db.py interface to domain/, implementation stays in infra/."
```

Engineers will work around fitness functions they can't understand. Make the failure message specific.

### Don't over-fit

100 fitness functions per service is friction without value. Pick the rules that matter:

- Real architectural decisions (not style preferences)
- Things that have actually broken before
- Cross-cutting concerns easy to violate

For coding style, use a formatter / linter — that's a different layer.

---

## Common fitness function targets

| Architectural concern | Fitness function |
|---|---|
| Service boundaries | Dependency graph; module visibility rules |
| API stability | Contract tests; breaking-change detection |
| Performance budget | Benchmarks; SLOs |
| Reliability | SLO error budgets; chaos tests |
| Security | SAST, SCA, container scanning |
| Cost | Per-service cost dashboards with alerts |
| Operational maturity | Logging coverage; tracing coverage; runbook presence |
| Data flow | Database access constraints |

---

## A real-world ADR + fitness function pair

**ADR-0023**: "Authentication is centralised in the auth service. No service may verify JWTs on its own."

**Fitness function**:
```python
def test_no_service_imports_jwt_directly():
    """Only auth-client may import JWT libraries."""
    for service in find_services():
        if service.name == "auth-client":
            continue
        assert "jwt" not in service.dependencies
        assert "jose" not in service.dependencies
        assert "pyjwt" not in service.dependencies
```

The decision in the ADR; the enforcement in CI. If someone tries to add `pyjwt` to a service, the PR fails.

---

## Risks and limitations

**1. False sense of security.** A passing CI doesn't mean the architecture is good — only that it doesn't violate the encoded rules.

**2. Brittle tests.** Module names change; rules referring to module names break. Use stable identifiers (interfaces, package metadata).

**3. Bypass culture.** If fitness functions slow people down without explaining why, they get circumvented (`# noqa`, `--no-verify`, etc.). Communicate the reason.

**4. Maintenance overhead.** Each fitness function is code; it can have bugs and need updates as the architecture evolves.

**5. Over-formalising.** Some architectural properties resist automation. Trust + judgement still matters.

---

## Tools by ecosystem

| Tool | Language / Use |
|---|---|
| ArchUnit | Java/Kotlin module rules |
| dependency-cruiser | JavaScript/TypeScript |
| pydeps, lint-imports | Python |
| cargo-modules | Rust |
| GoModguard | Go |
| Buf | Protobuf API compatibility |
| Pact | Consumer-driven contracts |
| OpenAPI Diff | REST API breaking changes |
| Trivy, Snyk, Checkov | Security |
| benchstat | Go performance regression |
| Datadog/New Relic SLO alerts | Production fitness |

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you treat architecture as something that's actively maintained, not a one-time decision.

**Strong answer pattern:**
1. ADR captures decision; fitness function enforces it mechanically
2. Examples: dependency rules, contract tests, perf benchmarks, SLOs in production
3. Run in CI when possible (cheapest to fix); production as last resort
4. Don't over-fit — encode the rules that matter, leave the rest to judgement
5. Pair every important ADR with a fitness function where automation is possible

**Common follow-up:** *"How would you enforce that internal services never bypass the API gateway?"*
> Two layers. CI: dependency-graph check that no service imports another service's internal client library. Production: network policy / service mesh that allows ingress only from the gateway. Either alone has gaps; both together is enforcement at the architecture level. Plus an ADR explaining why so future engineers don't disable the rule when frustrated by it.

---

## Related topics

- [ADRs](adrs.md) — what fitness functions enforce
- [Evolutionary Architecture](evolutionary-architecture.md) — fitness functions are core to the practice
- [Quality Attributes](quality-attributes.md) — what fitness functions typically measure
- [Testing IaC](../iac/testing-iac.md) — fitness functions for infrastructure
- [SLI, SLO, SLA](../observability/slo-sla.md) — runtime fitness functions
