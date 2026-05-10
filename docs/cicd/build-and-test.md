# Build and Test in CI

The build-and-test phase is where most pipeline time is spent — and where most pipeline pain comes from. Slow tests, flaky tests, dependency churn, and cache misses turn a 5-minute pipeline into 30 minutes. This page covers patterns to keep CI fast, reliable, and informative.

---

## The test pyramid (in CI)

```
         ┌────────┐    < 5%    slow, expensive, brittle
         │  E2E   │    minutes per test
        ┌┴────────┴┐
        │Integration│   ~15%    real DB/Redis, fewer mocks
       ┌┴───────────┴┐
       │   Unit       │   ~80%   fast, isolated, no I/O
       └──────────────┘
```

The pyramid in CI translates to:

- **Many** unit tests run on every push (fast feedback)
- **Some** integration tests run on PRs (real components, slower)
- **Few** end-to-end tests run on schedule or pre-deploy (real environment)

Inverting the pyramid (lots of e2e, few units) creates slow, flaky pipelines.

---

## Build stages

### 1. Restore cache

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cache/pip
    key: ${{ runner.os }}-pip-${{ hashFiles('requirements.txt') }}
    restore-keys: ${{ runner.os }}-pip-
```

### 2. Install dependencies

```yaml
- run: pip install -r requirements.txt -r requirements-dev.txt
```

### 3. Lint and format

```yaml
- run: |
    ruff check .
    ruff format --check .
```

### 4. Type check

```yaml
- run: mypy src/
```

### 5. Unit tests

```yaml
- run: pytest tests/unit --cov=src --cov-fail-under=80
```

### 6. Integration tests

```yaml
- run: pytest tests/integration
```

### 7. Build artifact

```yaml
- run: docker build -t myapp:${{ github.sha }} .
```

### 8. Security scan

```yaml
- uses: aquasecurity/trivy-action@master
  with:
    image-ref: myapp:${{ github.sha }}
    severity: CRITICAL,HIGH
    exit-code: '1'
```

### 9. Push artifact

```yaml
- run: docker push $REGISTRY/myapp:${{ github.sha }}
```

---

## Unit tests in CI

### Speed targets

| Test count | Target time |
|---|---|
| < 100 | < 30 seconds |
| 100-1000 | < 2 minutes |
| 1000-10000 | < 5 minutes (with parallelism) |
| 10000+ | < 10 minutes (with sharding) |

If unit tests take more than 5 minutes, something is wrong (probably I/O leaking into "unit" tests).

### Pure unit tests = no I/O

```python
# Unit test — no DB, no network, no filesystem
def test_calculate_order_total():
    order = Order(items=[
        OrderItem(price_cents=1000, quantity=2),
        OrderItem(price_cents=500,  quantity=1),
    ])
    assert order.calculate_total() == 2500

# NOT a unit test — touches DB
def test_create_order():
    db = connect_to_postgres()  # I/O!
    order = create_order(db, ...)
    assert order.id is not None
```

Pure unit tests run in milliseconds. Hundreds in a second.

### Parallel unit tests

```yaml
test:
  strategy:
    matrix:
      shard: [1, 2, 3, 4]
  steps:
    - run: pytest --shard ${{ matrix.shard }} --total-shards 4
```

Or with pytest-xdist:

```bash
pytest -n auto   # use all CPU cores
```

---

## Integration tests in CI

Integration tests need real dependencies. CI runners are clean — bring them up.

### Service containers (GitHub Actions)

```yaml
test:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:15
      env:
        POSTGRES_DB: test
        POSTGRES_PASSWORD: password
      ports: ["5432:5432"]
      options: >-
        --health-cmd pg_isready
        --health-interval 5s
        --health-timeout 3s
        --health-retries 5
    
    redis:
      image: redis:7
      ports: ["6379:6379"]
      options: --health-cmd "redis-cli ping" --health-interval 5s
  
  steps:
    - run: pytest tests/integration
      env:
        DATABASE_URL: postgresql://postgres:password@localhost:5432/test
        REDIS_URL: redis://localhost:6379
```

### Testcontainers (in-test container management)

```python
import pytest
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def postgres():
    with PostgresContainer("postgres:15") as pg:
        yield pg

def test_order_persists(postgres):
    db = connect(postgres.get_connection_url())
    order = create_order(db, ...)
    assert db.query(Order).filter_by(id=order.id).first() is not None
```

Testcontainers spins up real containers per test session. More flexible than service containers; works locally and in CI uniformly.

### LocalStack for AWS

```yaml
services:
  localstack:
    image: localstack/localstack:latest
    env:
      SERVICES: s3,dynamodb,sqs
    ports: ["4566:4566"]
```

Run AWS service emulators locally. Faster than real AWS, no cost, no flake from cloud-side eventual consistency.

---

## End-to-end tests

E2E tests run against a real deployed environment. The slowest, flakiest layer — use sparingly.

```yaml
e2e:
  runs-on: ubuntu-latest
  needs: deploy-staging
  steps:
    - uses: actions/checkout@v4
    - run: |
        npx playwright test \
          --base-url https://staging.example.com \
          --reporter html
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
```

Tools: Playwright, Cypress, Selenium.

Run e2e:

- **Pre-merge** for critical user flows (login, checkout)
- **Post-deploy to staging** for full coverage
- **Nightly** for the long tail
- **Never** for every commit on every branch (too slow, too costly)

---

## Caching dependencies

### Per language

```yaml
# Python
- uses: actions/setup-python@v5
  with:
    python-version: '3.11'
    cache: 'pip'

# Node
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'

# Go
- uses: actions/setup-go@v5
  with:
    go-version: '1.21'
    cache: true

# Java
- uses: actions/setup-java@v4
  with:
    distribution: 'temurin'
    java-version: '21'
    cache: 'gradle'
```

Each setup action handles cache key construction automatically.

### Manual cache

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.cargo
      target
    key: ${{ runner.os }}-cargo-${{ hashFiles('Cargo.lock') }}
    restore-keys: ${{ runner.os }}-cargo-
```

Key includes a hash of the lockfile → cache invalidates only when dependencies change.

---

## Docker layer caching

Order Dockerfile commands from most-stable to most-volatile:

```dockerfile
FROM python:3.11-slim

# 1. System deps (changes rarely) — cached unless apt-get changes
RUN apt-get update && apt-get install -y curl

# 2. Python deps (changes occasionally) — cached unless requirements.txt changes
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

# 3. Source code (changes every commit) — never cached, but small layer
COPY src/ ./src/

CMD ["python", "-m", "src"]
```

In CI:

```yaml
- uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: myapp:${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

`type=gha` uses GitHub Actions cache. Other options: `type=registry`, `type=s3`.

### Multi-stage builds

```dockerfile
# Build stage
FROM python:3.11 AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --user -r requirements.txt

# Runtime stage — no build tools, smaller image
FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY src/ ./src/
ENV PATH=/root/.local/bin:$PATH
CMD ["python", "-m", "src"]
```

Final image is smaller (no compilers, headers, build artifacts). Faster pulls, smaller attack surface.

---

## Test data management

### In-memory or fixture-based

```python
@pytest.fixture
def sample_order():
    return Order(
        id="ord-123",
        items=[OrderItem(price_cents=1000, quantity=2)],
        status="pending"
    )

def test_calculate_total(sample_order):
    assert sample_order.calculate_total() == 2000
```

Fast, deterministic, no setup needed.

### Database fixtures

```python
@pytest.fixture
def db():
    db = create_test_db()
    yield db
    db.rollback()   # or db.close() and recreate

@pytest.fixture(autouse=True)
def reset_db(db):
    db.execute("TRUNCATE orders, order_items CASCADE")
```

Roll back at end of test for isolation. `autouse=True` runs before every test.

### Snapshot/golden testing

```python
def test_renders_email():
    rendered = render_email(template="welcome", user=user)
    snapshot.assert_match(rendered)
```

Snapshot stored as a file; first run creates it; subsequent runs compare. Useful for templates, generated code, formatted output.

Reviewers must inspect snapshot diffs in PRs — easy to rubber-stamp.

---

## Flaky test management

### Detection

```yaml
- run: pytest --collect-flaky --rerun-failures 3
```

### Quarantine

```python
@pytest.mark.flaky(reruns=3)
def test_ratelimit_under_load():
    ...
```

Quarantined tests run but don't fail CI. Track them; fix or delete.

### Common causes

| Cause | Fix |
|---|---|
| Timing assumptions | Use deterministic clocks, mock `time` |
| Order dependence | Use isolated fixtures per test |
| Shared resources (port, file) | Random ports, unique paths |
| Real network calls | Mock with VCR or responses library |
| External services | Use Testcontainers, LocalStack |
| Eventual consistency | Polling with timeout, or mock |

---

## Code coverage

```yaml
- run: pytest --cov=src --cov-report=xml --cov-fail-under=80
- uses: codecov/codecov-action@v3
  with:
    file: coverage.xml
```

Coverage thresholds:

- **80%** is a reasonable bar — catches most untested code
- **100%** is usually wrong — chasing impossible-to-reach branches
- **<60%** means most of the code is untested

Coverage doesn't measure test quality — only test reach. A 100% covered codebase can still have logic bugs the tests don't assert.

---

## Faster feedback techniques

### Incremental testing — run only changed tests

```yaml
- run: |
    changed=$(git diff --name-only origin/main...)
    pytest --tb=short \
      --testmon \
      $(echo "$changed" | grep -E '^(src|tests)/')
```

`pytest-testmon` tracks which tests cover which lines and only runs affected tests on the next run.

### Test result caching

```yaml
- uses: actions/cache@v4
  with:
    path: .pytest_cache
    key: pytest-${{ hashFiles('src/**', 'tests/**') }}
```

`pytest --lf` (last-failed) skips passing tests on retries.

### Path-filtered jobs

```yaml
on:
  push:
    paths:
      - 'src/**'
      - 'tests/**'
      - 'requirements*.txt'
      - 'Dockerfile'
```

Skip CI on docs-only changes. Saves runner time and cost.

### Parallel job graphs

```yaml
jobs:
  lint:        { runs-on: ubuntu-latest, steps: [...] }
  unit-test:   { runs-on: ubuntu-latest, steps: [...] }
  build:       { runs-on: ubuntu-latest, steps: [...], needs: [lint, unit-test] }
  integration: { runs-on: ubuntu-latest, steps: [...], needs: [build] }
```

Independent jobs run in parallel. Bottleneck = longest job, not sum of jobs.

---

## CI runner sizing

| Runner | Cost (relative) | Use case |
|---|---|---|
| Standard 2-core | 1× | Lint, unit tests, simple builds |
| Standard 4-core | 2× | Larger test suites, Docker builds |
| Large 8-core | 4× | Heavy builds, parallel test sharding |
| GPU | 10×+ | ML model tests |
| ARM | 0.5× (often) | ARM-specific builds, sometimes cheaper |
| Self-hosted | Variable | Hardware-specific, very large workloads |

Don't run a giant runner for a 30-second lint job. Don't run a small runner for a 30-minute build.

---

## Build provenance and reproducibility

Modern supply-chain security requires reproducible builds:

```yaml
- uses: actions/attest-build-provenance@v1
  with:
    subject-name: ghcr.io/myorg/myapp
    subject-digest: sha256:abc123...
```

Generates SLSA provenance — what built it, from what source, with what dependencies. Verifiable later.

See [Security in CI/CD](security-in-cicd.md).

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you understand pipelines as performance and reliability concerns, not just "does it run."

**Strong answer pattern:**
1. Test pyramid — many unit, some integration, few e2e
2. Cache dependencies and Docker layers; pipeline time = engineer time
3. Parallelise jobs; shard slow tests
4. Service containers / Testcontainers for integration; LocalStack for AWS
5. Quarantine flaky tests immediately; fix or delete
6. Coverage threshold ~80%; not a quality measure

**Common follow-up:** *"Your CI takes 30 minutes. How do you cut it?"*
> Profile first — which jobs/tests dominate? Then: cache deps and Docker layers, parallelise jobs, shard slow tests, eliminate flaky retries, run only changed tests in PRs (full suite on main). The biggest win is usually caching and parallelism, not faster runners.

---

## Related topics

- [Fundamentals](fundamentals.md) — pipeline basics
- [Pipelines](pipelines.md) — concrete tool examples
- [Artifact Management](artifact-management.md) — what build produces
- [Security in CI/CD](security-in-cicd.md) — scanning steps
- [Testing Strategies](../software-design/testing-strategies.md) — broader test philosophy
