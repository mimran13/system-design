# Security in CI/CD

"Shift left" means moving security checks from post-deploy audits into the CI pipeline — catch vulnerabilities, secrets, and policy violations before they reach production. This page covers the scans, gates, and supply-chain controls that belong in a modern pipeline.

---

## The categories of security scanning

| Category | What it scans | When it runs |
|---|---|---|
| **SAST** (Static Application Security Testing) | Source code for vulnerable patterns | On every PR |
| **SCA** (Software Composition Analysis) | Dependencies for known CVEs | On every PR |
| **Secrets scanning** | Code/commits for leaked secrets | Pre-commit + on every push |
| **IaC scanning** | Terraform/CFN/K8s manifests | On every PR |
| **Container scanning** | Built image for vulnerable packages | Post-build, pre-push |
| **DAST** (Dynamic Application Security Testing) | Running application | Post-deploy to staging |
| **License scanning** | Dependency licences for compatibility | On dependency change |

Each catches different bugs. None is sufficient alone.

---

## SAST — static analysis of code

Looks for known-bad patterns: SQL injection, hardcoded credentials, unsafe deserialization, weak crypto.

### Semgrep

Open-source, fast, Pythonic rules:

```yaml
- uses: returntocorp/semgrep-action@v1
  with:
    config: >-
      p/security-audit
      p/owasp-top-ten
      p/secrets
```

Custom rule example:

```yaml
# .semgrep/rules/no-eval.yml
rules:
  - id: no-python-eval
    pattern: eval(...)
    message: "eval() is dangerous; refactor to avoid"
    severity: ERROR
    languages: [python]
```

### CodeQL (GitHub-native)

```yaml
- uses: github/codeql-action/init@v3
  with:
    languages: python, javascript

- uses: github/codeql-action/analyze@v3
```

CodeQL builds a queryable graph of the code; finds complex multi-step vulnerabilities (taint flow). More powerful than pattern-matchers but slower.

### Other SAST tools

- **SonarQube** — Polyglot, code quality + security
- **Checkmarx** / **Veracode** — Enterprise SAST suites
- **Bandit** (Python), **Brakeman** (Ruby), **gosec** (Go) — Language-specific

---

## SCA — dependency vulnerability scanning

Most production vulnerabilities come from third-party dependencies, not your own code.

### Dependabot (GitHub)

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: pip
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
  
  - package-ecosystem: docker
    directory: /
    schedule:
      interval: weekly
  
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

Opens PRs for vulnerable or outdated dependencies. Auto-merge for minor patches if CI passes:

```yaml
# .github/workflows/auto-merge.yml
on: pull_request
jobs:
  auto-merge:
    if: github.actor == 'dependabot[bot]'
    runs-on: ubuntu-latest
    steps:
      - run: gh pr merge --auto --squash "${PR_URL}"
```

### Renovate

More configurable than Dependabot — supports more package ecosystems, custom grouping, scheduling, automerge rules.

### Snyk

Commercial, broader coverage. Integrates into PR checks:

```yaml
- uses: snyk/actions/python@master
  with:
    args: --severity-threshold=high
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

### Trivy (also does containers + IaC)

```yaml
- uses: aquasecurity/trivy-action@master
  with:
    scan-type: fs
    scan-ref: .
    severity: HIGH,CRITICAL
    exit-code: '1'
```

### Pin direct dependencies, accept transitive churn

```python
# requirements.txt — pin direct deps
django==5.0.1
django-rest-framework==3.14.0

# requirements-lock.txt — fully resolved with hashes (pip-compile)
django==5.0.1 \
    --hash=sha256:abc...
```

Use `pip-tools`, `poetry`, `uv` to maintain lockfiles. Lockfile is what CI installs; matches what runs.

---

## Secrets scanning

Find AWS keys, API tokens, private keys committed to Git.

### Pre-commit (local)

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets

  - repo: https://github.com/zricethezav/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
```

```bash
pre-commit install
# Now every commit scans staged files
```

### CI scan

```yaml
- uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Scans the entire diff in the PR. Catches secrets that bypassed pre-commit (force-push, untracked files).

### Provider-side scanning

GitHub, GitLab, and Bitbucket all run secret scanning on push. Detects known-format secrets (AWS, Slack, Stripe). If detected, often auto-revokes via partner integration.

### What to do if a secret leaks

```
1. Rotate immediately (don't wait for "nobody saw it")
2. Revoke at the provider
3. Audit logs for misuse
4. Remove from Git history (BFG Repo-Cleaner) — but assume it was seen
5. Post-mortem: how did it bypass pre-commit?
```

Secrets in Git history are public the moment they're pushed. Cleanup is incident response, not prevention.

---

## IaC scanning

Already covered in [Testing IaC](../iac/testing-iac.md):

- **Checkov** — multi-cloud, hundreds of policies
- **tfsec** — Terraform-focused, fast
- **Trivy** — also scans Terraform/CloudFormation/K8s
- **OPA / Conftest** — custom policies

```yaml
- uses: bridgecrewio/checkov-action@master
  with:
    directory: infra/
    framework: terraform
    soft_fail: false
```

Catches: open security groups, unencrypted storage, IAM wildcards, missing logging.

---

## Container image scanning

Scans the built image for vulnerable packages.

### Trivy

```yaml
- uses: aquasecurity/trivy-action@master
  with:
    image-ref: myapp:${{ github.sha }}
    format: sarif
    output: trivy-results.sarif
    severity: CRITICAL,HIGH
    exit-code: '1'

- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: trivy-results.sarif
```

Catches:
- Vulnerable base image packages (apt, apk)
- Vulnerable language packages (npm, pip, gem)
- Misconfigurations (root user, etc.)

SARIF upload makes findings appear in GitHub Security tab.

### Grype + Syft

```bash
syft myapp:abc -o spdx-json > sbom.json
grype sbom:./sbom.json
```

Generate SBOM with Syft, scan with Grype. Decoupled — useful when SBOM is needed for other purposes (compliance, attestation).

### ECR scan-on-push

```hcl
resource "aws_ecr_repository" "app" {
  name = "myapp"
  image_scanning_configuration {
    scan_on_push = true
  }
}
```

ECR scans every pushed image automatically. Free tier; results visible in console.

### Distroless / minimal base images

```dockerfile
# Instead of python:3.11
FROM gcr.io/distroless/python3-debian12

# Or for Go binaries
FROM gcr.io/distroless/static
```

Distroless images contain only the runtime — no shell, no package manager, no busybox. Smaller attack surface, fewer vulnerable packages.

---

## DAST — dynamic application testing

Scans the **running app** for vulnerabilities. Different from SAST: tests behaviour, not code.

### OWASP ZAP

```yaml
deploy-staging:
  # ... deploy ...

dast:
  needs: deploy-staging
  runs-on: ubuntu-latest
  steps:
    - uses: zaproxy/action-baseline@v0.10.0
      with:
        target: 'https://staging.example.com'
        rules_file_name: '.zap/rules.tsv'
```

Tests:
- SQL injection on input fields
- XSS reflected/stored
- Open redirects
- Missing security headers
- Information disclosure

DAST is slow (minutes per scan) — typically run post-deploy to staging, not on every PR.

---

## License compliance

```yaml
- uses: fossas/fossa-action@main
  with:
    api-key: ${{ secrets.FOSSA_API_KEY }}
```

Or `pip-licenses`, `licensecheck`, `npm-license-checker`:

```bash
pip-licenses --format=json > licenses.json
# CI rejects if a GPL package shows up in a proprietary product
```

Categorise allowed/disallowed licences:

```
Permissive (always OK):       MIT, BSD, Apache-2.0, ISC
Weak copyleft (depends):      LGPL, MPL
Strong copyleft (often no):   GPL, AGPL
```

Compliance violations can be expensive; catch them in CI.

---

## Supply chain — SLSA and signing

SLSA (Supply-chain Levels for Software Artifacts) defines maturity levels for build provenance.

### Level 1: Documented build process
- Pipeline-as-code (yes by default with GitHub Actions / GitLab CI)

### Level 2: Tamper resistance after build
- Signed artifacts (cosign)
- Provenance attestation

### Level 3: Hardened build platform
- Build runs on isolated, controlled infrastructure
- Source and build are versioned and verified

### Level 4: Two-party review
- All changes reviewed
- Hermetic builds (no network access during build)

Most teams aim for level 2-3.

### Signing with cosign

```yaml
- uses: sigstore/cosign-installer@v3
- run: cosign sign --yes ghcr.io/myorg/myapp@sha256:abc...
```

Keyless — uses OIDC token from CI, no long-lived signing key.

### Provenance with build-provenance action

```yaml
- uses: actions/attest-build-provenance@v1
  with:
    subject-name: ghcr.io/myorg/myapp
    subject-digest: sha256:abc...
```

Produces an in-toto attestation tying image to build inputs.

### Verification at deploy

```bash
cosign verify ghcr.io/myorg/myapp@sha256:abc... \
  --certificate-identity https://github.com/myorg/myapp/.github/workflows/ci.yml@refs/heads/main \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Or via Kubernetes admission policy (Kyverno, Sigstore Policy Controller).

---

## Hardening the pipeline itself

CI is a high-value target — credentials, build artifacts, signing keys.

### Pin third-party actions

```yaml
# WRONG — moving target, supply-chain risk
- uses: some-org/their-action@main

# BETTER — version tag (still mutable in theory)
- uses: some-org/their-action@v1.2.3

# BEST — pinned to commit SHA
- uses: some-org/their-action@a1b2c3d4e5f...
```

GitHub's Dependabot can update SHA pins automatically.

### Minimise permissions

```yaml
permissions: {}   # default-deny, then grant per-job

jobs:
  build:
    permissions:
      contents: read
      packages: write   # only what's needed
    steps: [...]
```

### Use OIDC, not stored credentials

(Covered in [Fundamentals](fundamentals.md).)

### Scoped tokens

GitHub: use the built-in `GITHUB_TOKEN` for repo-scoped operations. Custom PATs only when crossing repo boundaries.

### Review third-party actions before adopting

Even popular actions can be malicious. Check:
- Repository activity, maintainer reputation
- Permissions requested
- Code of the action (it's just code)

---

## Putting it together — security pipeline

```yaml
name: Security

on: [pull_request]

permissions:
  contents: read
  security-events: write

jobs:
  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with: { languages: python }
      - uses: github/codeql-action/analyze@v3
      - uses: returntocorp/semgrep-action@v1
        with:
          config: p/security-audit p/owasp-top-ten

  sca:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          severity: CRITICAL,HIGH
          exit-code: '1'

  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2

  iac:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bridgecrewio/checkov-action@master
        with: { directory: infra/, framework: terraform }

  container:
    runs-on: ubuntu-latest
    needs: sca
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t scan:${{ github.sha }} .
      - uses: aquasecurity/trivy-action@master
        with:
          image-ref: scan:${{ github.sha }}
          severity: CRITICAL,HIGH
          exit-code: '1'
```

All four jobs run in parallel. Failure of any blocks merge.

---

## Suppression discipline

Findings will fire — many will be false positives. Suppress with **explicit, justified, time-bound** annotations:

```yaml
# checkov:skip=CKV_AWS_24:Public access required for static site, reviewed 2024-01-15
```

```python
# nosec B608: Query string is built from internal constants, not user input
query = f"SELECT * FROM {TABLE} WHERE id = ?"
```

Periodic review of suppressions — they should not be permanent. If a rule consistently produces false positives, tune the rule, not the suppression count.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you treat security as a continuous process baked into CI, not a quarterly audit.

**Strong answer pattern:**
1. SAST + SCA + secrets scan on every PR; container scan post-build; DAST post-deploy
2. Pin actions to SHA; minimise CI permissions; OIDC for cloud auth
3. Sign images with cosign; generate SBOM; verify at deploy
4. Dependabot/Renovate for dependency churn; auto-merge for low-risk patches
5. Suppress findings with justification; review suppressions periodically

**Common follow-up:** *"What if a vulnerability is found in a base image you can't update?"*
> Three options: (1) Use a different base image (alpine → distroless), (2) Patch the package directly in your Dockerfile, (3) Risk-accept with documented rationale and compensating controls. Track exceptions; revisit. Never just suppress and forget.

---

## Related topics

- [Fundamentals](fundamentals.md) — pipeline auth and OIDC
- [Build and Test](build-and-test.md) — where these fit
- [Artifact Management](artifact-management.md) — signing and provenance
- [Secrets in IaC](../iac/secrets-in-iac.md) — Terraform-specific
- [API Security](../security/api-security.md) — runtime app security
- [Secrets Management](../security/secrets-management.md) — full secrets lifecycle
