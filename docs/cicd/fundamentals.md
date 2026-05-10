# CI/CD Fundamentals

The mental model behind CI/CD: what each stage does, why the order matters, what makes a pipeline good or bad, and the principles that translate across tools.

---

## Three terms, three different things

### Continuous Integration (CI)
Every push to a branch triggers automated checks — build, lint, test. The goal: catch problems within minutes of the change, not at release time.

```
Developer pushes commit
  → CI job runs in 5 minutes
  → Pass → ready for review/merge
  → Fail → developer fixes immediately, while context is fresh
```

### Continuous Delivery (CD, the safer one)
Every successful CI run produces a **deployable artifact**. Deploying to production is a single click — but a human chooses when to click.

```
Merge to main
  → CI passes → artifact published
  → Auto-deploy to staging
  → Human reviews → presses "Deploy to production"
```

### Continuous Deployment (CD, the bolder one)
Every successful CI run **automatically deploys** to production. No human gate.

```
Merge to main
  → CI passes
  → Auto-deploy to staging → smoke tests
  → Auto-deploy to production
```

Continuous Deployment requires strong automated gates: full test coverage, automated rollback, observability that catches regressions. Most teams do Continuous Delivery, not Deployment.

---

## Pipeline stages, in order of cost

```
Stage              Time      Failure cost              Failure rate
─────────────────  ────────  ────────────────────────  ─────────────
1. Lint/format     <30s      Low (cosmetic)            Frequent
2. Type check      <1min     Medium (compile-time)     Common
3. Unit tests      1-5min    Medium (logic bug)        Common
4. Build           1-5min    Medium (broken artifact)  Rare
5. Security scan   30s-2min  Medium (vuln)             Variable
6. Integration     5-15min   High (system bug)         Less common
7. Deploy staging  1-5min    High (env issue)          Less common
8. Smoke tests     1-5min    Critical (real env)       Rare
9. Deploy prod     1-15min   Critical (user impact)    Rare
```

**Run cheap stages first.** A 30-second lint failure is much better than learning the same thing after a 20-minute test run.

---

## Quality gates

A "gate" is a check that must pass for the pipeline to proceed.

### Required gates

```yaml
quality_gates:
  - lint_passes: true
  - type_check_passes: true
  - unit_test_pass_rate: 100%
  - test_coverage: ">= 80%"
  - security_scan: "no CRITICAL vulnerabilities"
  - dependency_audit: "no known critical CVEs"
  - build_succeeds: true
```

### Gate placement

```
Pre-merge (PR):     lint, types, unit tests, security scan
Pre-deploy:         integration tests, contract tests
Pre-production:     smoke tests in staging, manual approval
Post-deploy:        production smoke tests, error rate monitoring
```

Gates that block PRs catch most issues before they reach main. Gates after merge catch issues that need a real environment to detect.

---

## Trigger types

```yaml
on:
  push:
    branches: [main, develop]      # CI on every push to these
  pull_request:
    branches: [main]                # CI on PRs targeting these
  schedule:
    - cron: '0 6 * * *'             # nightly e2e tests
  workflow_dispatch:                # manual trigger from UI
  release:
    types: [published]              # on GitHub release publish
  workflow_run:                     # cascade from another workflow
    workflows: [CI]
    types: [completed]
```

| Trigger | Use case |
|---|---|
| Push | Run CI on branch updates, deploy on main |
| Pull request | Validate before merge, post plan/diff comments |
| Schedule | Nightly long-running tests, drift detection, security scans |
| Manual | One-off operations (rollback, hotfix deploy) |
| Release | Production deploy on tagged release |
| Cascade | Chain workflows (CI → deploy → notify) |

---

## Caching — the single biggest pipeline-speed lever

CI runners start clean. Caching avoids re-downloading and re-building unchanged dependencies.

### Dependency cache

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cache/pip
    key: ${{ runner.os }}-pip-${{ hashFiles('requirements.txt') }}
    restore-keys: ${{ runner.os }}-pip-

- run: pip install -r requirements.txt   # uses cache if key matches
```

Saves minutes per run on large dependency trees.

### Docker layer cache

```dockerfile
FROM python:3.11-slim

# Layer 1: rarely changes (cache hit on most builds)
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

# Layer 2: changes every commit (cache miss expected)
COPY src/ ./src/
```

Docker rebuilds only the layers after the first changed line. Order Dockerfile commands from least-changing (deps) to most-changing (source).

```yaml
- uses: docker/build-push-action@v5
  with:
    context: .
    cache-from: type=gha               # GitHub Actions cache
    cache-to: type=gha,mode=max
    push: true
    tags: ${{ env.IMAGE }}:${{ github.sha }}
```

### Test result cache

```yaml
- uses: actions/cache@v4
  with:
    path: .pytest_cache
    key: pytest-${{ hashFiles('src/**', 'tests/**') }}
```

`pytest --lf` then runs only previously-failed tests on retries.

---

## Parallelism

Sequential pipeline:

```
[lint] → [unit tests] → [build] → [integration] → [deploy]
total: 30 minutes
```

Parallel pipeline:

```
[lint]      ─┐
[unit tests]─┼─→ [build] → [integration] → [deploy]
[security]  ─┘
total: 18 minutes
```

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [...]
  
  test:
    runs-on: ubuntu-latest
    steps: [...]
  
  security:
    runs-on: ubuntu-latest
    steps: [...]
  
  build:
    needs: [lint, test, security]   # waits for all three
    runs-on: ubuntu-latest
    steps: [...]
```

Test parallelism (sharding):

```yaml
test:
  strategy:
    matrix:
      shard: [1, 2, 3, 4]
  steps:
    - run: pytest --shard ${{ matrix.shard }} --total-shards 4
```

4 shards × 5 min = 5 min wall-clock instead of 20.

---

## Determinism — same input, same output

CI must be **reproducible**. Common sources of flakiness:

| Cause | Fix |
|---|---|
| Floating dependency versions | Pin exact versions (lockfiles, `requirements.txt` with `==`) |
| Time-dependent tests | Inject a clock; freeze in tests |
| Network calls in tests | Mock or use VCR |
| Non-deterministic test order | Sort or seed test runner |
| Shared mutable state | Isolate fixtures per test |
| Real cloud calls | Use LocalStack, Testcontainers, or mock |
| Random data | Seed random generators |

Flaky tests destroy trust. Once a team starts retrying CI ("just rerun, it'll pass"), the gate is effectively gone.

---

## The artifact contract

CI produces an **immutable artifact** — typically a container image or a versioned package. Everything downstream uses *this exact artifact*.

```
CI:    builds image → tags with git SHA → pushes to registry
Stage: pulls image:abc123 → deploys to staging
Smoke: validates staging
Prod:  pulls image:abc123 (same one) → deploys to production
```

If staging passes, production deploys the byte-identical artifact that was tested. No "rebuild before prod" — that's a different artifact and invalidates the test signal.

---

## Idempotency in CI

Re-running a job must produce the same result:

```bash
# BAD: appends to a remote file
curl -X POST -d "Deployed at $(date)" /api/log

# GOOD: idempotent — sets state, doesn't accumulate
kubectl set image deployment/app app=myimage:abc123 --record
```

If a job is interrupted and retried, it must converge to the same state — not duplicate work or fail.

---

## Branch protection rules

Enforce gates at the Git layer, not just the CI tool:

```
Branch: main
  ✓ Require pull request before merging
  ✓ Require approvals (≥1)
  ✓ Dismiss stale reviews when new commits pushed
  ✓ Require status checks before merging:
      - ci/lint
      - ci/test
      - ci/build
      - ci/security-scan
  ✓ Require branches to be up to date before merging
  ✓ Require conversation resolution before merging
  ✓ Require signed commits
  ✓ Include administrators (no exceptions for owners)
  ✓ Restrict who can push (CI bot only for direct pushes)
```

CI tools can be bypassed; branch protection cannot.

---

## Authentication and secrets

### OIDC (OpenID Connect) — modern standard

CI provider issues a short-lived JWT to the cloud. Cloud verifies and grants a temporary role.

```yaml
permissions:
  id-token: write          # required for OIDC
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::123456789:role/ci-role
      aws-region: us-east-1
```

IAM role trust policy:

```json
{
  "Effect": "Allow",
  "Principal": {
    "Federated": "arn:aws:iam::123:oidc-provider/token.actions.githubusercontent.com"
  },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:sub": "repo:myorg/myrepo:ref:refs/heads/main"
    }
  }
}
```

No keys stored in GitHub secrets. Trust is on **repo + branch + workflow**.

### Secrets in CI

```yaml
- run: ./deploy.sh
  env:
    DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
```

Best practices:

- Scope secrets to environments (`production` env has secrets `develop` doesn't)
- Use OIDC where possible — secrets needed only for things OIDC can't reach (PyPI, npm, third-party APIs)
- Never echo secrets to logs (most CI systems mask, but errors leak)
- Rotate periodically; revoke immediately on compromise

---

## Pipeline observability

```
✓ Build duration trends (regression detection)
✓ Failure rate per stage
✓ Most flaky tests
✓ Time waiting for runners (queue depth)
✓ Cache hit rate
✓ Cost per pipeline run
```

If you don't measure pipeline performance, you don't notice when it triples in length over a quarter.

---

## Cost control

CI is not free:

- Self-hosted runners cost compute + maintenance
- Hosted runners (GitHub-hosted) charged per minute
- Re-running failed jobs is billable
- Long pipelines on every push add up

Levers:

- Path filters (only run when relevant files change)
- Concurrency limits (cancel old runs on new pushes)
- Cache aggressively (compute once, reuse)
- Smaller runners where possible
- Skip stages when nothing changed (e.g., docs-only PR skips integration tests)

```yaml
on:
  push:
    paths:
      - 'src/**'
      - 'tests/**'
      - '.github/workflows/ci.yml'

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true   # cancel old runs on new push to same branch
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you understand pipelines as systems with their own quality concerns — speed, reliability, cost — not just "does CI run."

**Strong answer pattern:**
1. Pipeline runs cheap stages first; fast feedback for common failures
2. Cache and parallelise; pipeline time is engineer time
3. Artifact built once, promoted unchanged through environments
4. Branch protection + OIDC; no stored credentials, no merge bypass
5. Observability on the pipeline itself — duration, flakiness, cost

**Common follow-up:** *"What's the difference between CI passing on a feature branch and CI passing on the merge?"*
> Feature branch CI runs against a stale base — main may have moved. Pre-merge "merge queue" or "require branches up to date" rebases against latest main and reruns CI. Catches conflicts that pass on the branch but fail on merge.

---

## Related topics

- [Pipelines](pipelines.md) — concrete tool examples
- [Build and Test](build-and-test.md) — the test pyramid in CI
- [Branching Strategies](branching-strategies.md) — how flow shapes pipelines
- [Security in CI/CD](security-in-cicd.md) — what to scan and how
- [Deployment Strategies](deployment-strategies.md) — the last mile
