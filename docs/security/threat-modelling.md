---
tags:
  - applied
---

# Threat Modelling

Designing systems with security as a first-class concern. Not "we'll secure it later" — security architecture from the design phase. This page covers **STRIDE** (the standard framework), supply chain security, signing and provenance, and defence in depth done right.

For *specific security topics* (auth, encryption, etc.), see [Security section](index.md). This page is about the **methodology** of thinking about threats.

---

## Why threat modelling matters

Most security incidents happen because nobody asked the question.

```
"What could go wrong?"
"Who might want to attack this?"
"What's the worst case?"

Asked in design phase: cheap to fix
Asked after incident: expensive lesson
```

Threat modelling is a **discipline** of asking these questions systematically.

---

## STRIDE — the standard framework

STRIDE (from Microsoft) categorises threats into six types. Useful for systematically thinking through what could go wrong.

```
S — Spoofing identity
T — Tampering with data
R — Repudiation
I — Information disclosure
D — Denial of service
E — Elevation of privilege
```

For each component or data flow in your system, ask: which STRIDE threats apply?

### S — Spoofing

Pretending to be someone (or something) else.

```
Examples:
  - Attacker uses stolen credentials to log in
  - Phishing the user to obtain credentials
  - Compromised service certificate; impersonating service-to-service
  - DNS hijacking; redirecting traffic to attacker

Mitigations:
  - Multi-factor authentication
  - mTLS for service-to-service
  - Certificate pinning
  - DNSSEC
  - Hardware tokens
```

### T — Tampering

Modifying data or code.

```
Examples:
  - Attacker modifies a request in transit
  - Attacker modifies stored data
  - Attacker injects code (SQL injection, XSS)
  - Compromised CI/CD modifies the build

Mitigations:
  - TLS in transit
  - Cryptographic signatures
  - Input validation; parameterised queries
  - Code signing
  - File integrity monitoring
```

### R — Repudiation

Denying having done something.

```
Examples:
  - User denies authorising a transaction
  - Admin denies making a change
  - No logs of who did what

Mitigations:
  - Audit logs (tamper-evident)
  - Digital signatures
  - Non-repudiation tokens
  - Witness signatures
```

### I — Information disclosure

Leaking data to unauthorised parties.

```
Examples:
  - Accidentally returning sensitive data in API responses
  - Logs containing PII
  - Verbose error messages exposing internals
  - Insufficient access controls; data exposed to too many people
  - Encryption keys leaked

Mitigations:
  - Data classification and access controls
  - Encrypt at rest and in transit
  - Scrub PII from logs
  - Minimal error messages to users (detailed only in internal logs)
  - Secrets in dedicated vaults
```

### D — Denial of service

Making the service unavailable.

```
Examples:
  - DDoS attack (volumetric)
  - Algorithmic complexity attack (expensive queries)
  - Resource exhaustion (memory, connections, disk)
  - Logic bombs in user input

Mitigations:
  - Rate limiting
  - CDN / DDoS protection (Cloudflare, AWS Shield)
  - Resource quotas; bulkheads
  - Input size limits
  - Circuit breakers
```

### E — Elevation of privilege

Gaining more access than authorised.

```
Examples:
  - SQL injection bypassing auth
  - Bug in auth check
  - Vulnerable dependency exploited
  - Insufficient input validation in admin paths
  - Container escape

Mitigations:
  - Least privilege everywhere
  - Defence in depth (multiple checks)
  - Vulnerability scanning
  - Patch management
  - Sandboxing
  - Just-in-time access for admin operations
```

---

## How to actually run a threat model

Don't get academic. Iterative, practical approach:

### Step 1: Draw the data flow diagram

```
External user → API gateway → Service A → Service B → Database
                                       ↘
                                        Service C → External API

Trust boundaries: where data crosses from one trust zone to another.
External → internal: clear boundary
Service A → Service B: boundary if different teams own / different security posture
```

A simple boxes-and-arrows diagram is enough. Don't overthink it.

### Step 2: For each component / flow, apply STRIDE

```markdown
| Component | S | T | R | I | D | E |
|---|---|---|---|---|---|---|
| Login endpoint | brute force; phishing | password tampering | | password disclosure | rate limit DoS | session token escalation |
| Database | impersonate DB | data tampering at rest | | data leak | | privilege via SQL injection |
| ...
```

This is the rough exercise. Don't fill every cell; identify which threats matter for each component.

### Step 3: Risk-rate each threat

```
For each identified threat:
  Likelihood: how likely is this attack?
  Impact:     how bad if it succeeds?
  
Risk = likelihood × impact

Focus on high-risk threats; accept low-risk ones.
```

DREAD is one ratings framework (Damage, Reproducibility, Exploitability, Affected users, Discoverability). Modern view: simpler 3-level (high/med/low) often works.

### Step 4: Identify mitigations

```
For each high-risk threat:
  What controls do we have / will we add?
  Are they sufficient?
  What's the residual risk after mitigation?
```

### Step 5: Document and revisit

Threat models are **living documents**. Update when:
- Architecture changes
- New attack patterns emerge
- After incidents
- Annually at minimum

---

## When to threat-model

```
Always:
  ✓ New system design
  ✓ Architectural change to security-sensitive component
  ✓ New external integration
  ✓ Acquisition (acquired system's threat model)

Periodically:
  ✓ Annual review of major systems
  ✓ After security incidents
  ✓ Before major compliance audits

Not necessary:
  ✗ Every PR
  ✗ Routine bug fixes
  ✗ Internal-only tooling with no sensitive data
```

The trap: threat modelling everything = bottleneck = nobody does it. Focus on high-risk components.

---

## Defence in depth — done right

The principle: **don't rely on a single security control.** Multiple layers, so a breach of one doesn't compromise the system.

### Bad defence in depth (security theatre)

```
Layer 1: Firewall (default allow)
Layer 2: Authentication (works if you have the password)
Layer 3: Authorization (after auth)

If attacker steals password: gets through everything.
"Multiple layers" but they don't actually defend independently.
```

### Good defence in depth

```
Layer 1: Network (private subnet, security groups, no public access)
Layer 2: Service mesh (mTLS, only authorised services can call)
Layer 3: Application authn (MFA for users; SSO required)
Layer 4: Authz (RBAC; role checks per endpoint)
Layer 5: Data (encrypted; per-record access checks)
Layer 6: Monitoring (anomaly detection; alerts on suspicious patterns)

Each layer is independent; compromising one doesn't bypass others.
Attacker who steals a user's password still needs MFA + has limited blast radius.
```

### Key principle: assume breach

```
Don't ask: "is our perimeter secure?"
Ask: "if an attacker IS inside, how much can they do?"

Implications:
  - Lateral movement should be blocked (segmentation)
  - Even internal services authenticate (mTLS / zero trust)
  - Sensitive operations require additional verification
  - Detection > prevention (you WILL be breached; detect fast)
```

See [Zero Trust](zero-trust.md).

---

## Supply chain security

Increasingly the dominant attack vector. SolarWinds (2020), Log4Shell (2021), xz-utils (2024) all started here.

### The supply chain

```
You write code.
You depend on hundreds of open-source packages.
Those packages depend on more packages.
You build images that depend on base images.
You deploy with CI/CD tools.

Every step is a potential attack point.
```

### Threats

```
Malicious package published:        attacker submits a similarly-named package; you typo it
Compromised maintainer account:     legitimate package suddenly contains malware
Build system compromise:            CI injects malware into your build
Compromised CDN / registry:         downloads infected
Compromised base image:             your container starts with malware
Vendor breach:                      vendor leaks credentials, including yours
```

### SLSA — Supply-chain Levels for Software Artifacts

Framework for supply chain security maturity. Levels 1-4.

```
SLSA Level 1: Documented build process
              Producer signs artifacts

SLSA Level 2: Tamper-resistant build
              Build platform attests to artifact provenance
              Authenticated source

SLSA Level 3: Hardened build platform
              Source and build platform meet specific security requirements
              Two-party review of changes
              Build runs in isolated, reproducible environment

SLSA Level 4: Two-party review of everything
              Hermetic, reproducible builds
              Maximum supply chain integrity
```

Most teams should target Level 2-3. Level 4 is for highest-security environments.

### Sigstore — modern supply chain tooling

Open-source ecosystem for signing and verifying artifacts. Components:

```
cosign:       sign container images (keyless via OIDC; no private keys to manage)
fulcio:       short-lived certificates from identity (e.g., GitHub Actions identity)
rekor:        transparency log of all signatures
in-toto:      attestations about how artifacts were built
```

```bash
# Sign a container image (keyless; uses OIDC identity)
cosign sign --yes ghcr.io/myorg/myapp@sha256:abc...

# Verify signature came from a specific GitHub Actions workflow
cosign verify ghcr.io/myorg/myapp@sha256:abc... \
  --certificate-identity-regexp https://github.com/myorg/ \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

In Kubernetes, admission policies (Kyverno, Sigstore Policy Controller) verify signatures at deploy.

### SBOM — Software Bill of Materials

A list of every dependency in your artifact.

```
syft myapp:abc123 -o spdx-json > sbom.json
grype sbom:./sbom.json  # check for known vulnerabilities

# Attach SBOM to image
cosign attach sbom --sbom sbom.json myapp@sha256:abc...
```

Required by US government contracts now. Strongly suggested by SLSA. Useful for:
- Vulnerability response ("which of our services contain log4j?")
- Compliance (SOC 2 increasingly expects this)
- Supply chain integrity (know what's actually in there)

### Provenance attestations

In-toto attestations: signed claims about how an artifact was built.

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [{"name": "ghcr.io/myorg/myapp", "digest": {"sha256": "abc..."}}],
  "predicateType": "https://slsa.dev/provenance/v1",
  "predicate": {
    "buildDefinition": {
      "buildType": "https://github.com/actions/workflow",
      "externalParameters": {"workflow": ".github/workflows/build.yml@refs/heads/main"}
    },
    "runDetails": {"builder": {"id": "https://github.com/actions/runner"}}
  }
}
```

Means: "this artifact was built by this specific workflow, from this specific repo, at this commit." Verifiable.

### Dependency security

Practical patterns:

```
✓ Pin dependencies (lockfiles: package-lock.json, requirements.lock, go.sum)
✓ Scan dependencies in CI (Dependabot, Snyk, Trivy)
✓ Auto-merge minor patches (Dependabot + tests)
✓ Review major updates manually
✓ Subscribe to security advisories for critical deps
✓ Use private registries for internal packages (npm, PyPI, Maven)
✓ Verify checksums on downloads
✓ Audit transitive dependencies (run dependency tree analysis)
```

```bash
# Audit
npm audit
pip-audit
cargo audit

# CI integration
- uses: aquasecurity/trivy-action@master
  with:
    scan-type: fs
    severity: CRITICAL,HIGH
    exit-code: '1'
```

---

## Common attack patterns

### Credential stuffing

```
Attacker has list of leaked credentials from another breach.
Tries them on your login.

Mitigation:
  - Rate limit per IP and per username
  - Detect distributed attempts (many IPs, same usernames)
  - Have-I-Been-Pwned check at signup
  - Force password reset if user's password seen in breach
  - MFA
```

### Account takeover

```
Attacker gains access to user's account.
Then performs actions: drain funds, exfiltrate data, etc.

Mitigation:
  - MFA (significantly reduces account takeover)
  - Anomaly detection (login from unusual location)
  - Step-up auth for sensitive actions (e.g., re-MFA for high-value transfers)
  - Email notification of new login
  - Sessions: short timeouts; invalidate on password change
```

### SSRF (Server-Side Request Forgery)

```
Attacker tricks server into making requests on attacker's behalf.
Often used to access internal services / cloud metadata endpoints.

Example: image upload that fetches a URL; attacker uses URL = http://169.254.169.254/ (AWS metadata)
         and the server fetches credentials.

Mitigation:
  - Validate / whitelist URLs
  - Block internal IP ranges in outbound requests
  - Block cloud metadata endpoint specifically (IMDSv2 helps on AWS)
  - Separate service for fetching user-provided URLs
```

### SQL injection (still common)

```
User input incorporated into SQL without parameterisation.

Mitigation:
  - Parameterised queries (every modern library supports)
  - ORM (use built-in escaping)
  - Avoid raw SQL with user input
  - Input validation as defence in depth
```

### XSS (Cross-Site Scripting)

```
User input rendered to other users' pages without escaping.
Attacker injects JavaScript; runs in other users' browsers.

Mitigation:
  - Template engine that auto-escapes
  - Content Security Policy (CSP) headers
  - HttpOnly cookies (XSS can't read them)
  - Sanitise rich-text inputs (DOMPurify)
```

### CSRF (Cross-Site Request Forgery)

```
Attacker's website causes user's browser to make state-changing requests to your site.

Mitigation:
  - SameSite cookies (modern default)
  - CSRF tokens
  - Don't accept GET for state changes
```

### Insider threat

```
Trusted employee abuses access.

Mitigation:
  - Least privilege
  - Just-in-time access (no permanent prod access)
  - Audit logs reviewed
  - Separation of duties (no single person can do everything)
  - Background checks
  - Offboarding revokes access promptly
```

### Phishing of employees

```
Sophisticated phishing → employee credentials compromised.

Mitigation:
  - Hardware security keys (FIDO2) — resistant to phishing
  - Security training (with realistic phishing tests)
  - Verify identity for sensitive requests (e.g., wire transfer auth)
  - Detect anomalies in employee activity
```

---

## Secrets and identity

### Workload identity

```
Service A needs to call Service B's API.
Bad: hardcoded API key in Service A
Good: Service A has an identity; Service B authenticates the call

Mechanisms:
  - mTLS with certificates issued by internal CA
  - JWT signed by identity provider
  - Cloud workload identity (GCP Workload Identity, AWS IAM Roles for SA)
  - Service mesh (Istio handles automatically)
```

### Secret rotation

```
Long-lived secrets are a liability.
Goal: short-lived secrets, rotated automatically.

Patterns:
  - OIDC for cloud auth (short-lived tokens; no static keys)
  - Dynamic database credentials (Vault generates per-request)
  - Auto-rotation of static secrets (AWS Secrets Manager rotation)
  - Forced rotation on suspected compromise
```

### Secrets storage

```
NEVER:
  ✗ In code
  ✗ In environment variables (unless via secrets manager runtime injection)
  ✗ In container images
  ✗ In wikis / Slack / email

ALWAYS:
  ✓ Secrets manager (AWS Secrets Manager, Vault, GCP Secret Manager)
  ✓ Injected at runtime
  ✓ Access logged
  ✓ Rotated regularly
```

---

## Logging for security

Security-relevant events to log:

```
✓ Authentication events (login, logout, failure, MFA challenge)
✓ Authorization events (permission denied)
✓ Sensitive data access (who accessed which records)
✓ Configuration changes
✓ Administrative actions
✓ Cryptographic operations (key access, key changes)
✓ Data export / bulk download
```

Don't log:

```
✗ Passwords (ever, even hashed in log)
✗ Authentication tokens
✗ Full credit card numbers
✗ SSN / national ID in full
✗ Encryption keys
```

Log retention: typically 1-7 years depending on compliance regime. Encrypted at rest; access-controlled.

---

## Anomaly detection

Logs aren't useful if nobody looks at them. Automate detection:

```
Patterns to alert on:
  - Failed logins from many IPs for one account
  - Successful login from unusual location
  - Spike in API errors (could be attack reconnaissance)
  - Large data export by single user
  - Admin action outside business hours
  - New IP / device for a high-privilege account
  - Unusual cross-service call patterns
```

Tools: SIEMs (Splunk, Datadog Cloud SIEM, Sumo Logic), specialised tools (Panther, Vectra). For most companies, Datadog logs + custom alerts is sufficient start.

---

## Threat modelling worked example: payment service

```
Component: Payment processing endpoint

Data flow:
  User browser → API gateway → Payment service → Stripe API

STRIDE:
  Spoofing:
    User identity: handled by auth layer (mitigated)
    Stripe response: HTTPS + Stripe's mTLS (mitigated)
    Internal service identity: mTLS via service mesh (mitigated)
    Risk: low
  
  Tampering:
    Payment amount tampering in request: signed amounts; validation (mitigated)
    Modify stored payment record: DB encryption + access controls (mitigated)
    Risk: medium → ensure server-side amount validation
  
  Repudiation:
    User claims didn't authorize: 
      - Stripe collects auth confirmation
      - Audit log per payment
      - Idempotency keys per attempt
    Risk: low
  
  Information disclosure:
    Card number visibility: TOKENISED via Stripe; we never see (mitigated)
    Payment amounts in logs: log only redacted (last 4 digits at most)
    Risk: low (because of tokenisation)
  
  Denial of service:
    Spam payments: rate limit per user; per card
    Algorithmic complexity: amount and currency validation
    Risk: medium → ensure rate limits in place
  
  Elevation of privilege:
    Privilege escalation via payment endpoint: 
      - Only authenticated users can use
      - Bypassing payment: not possible (Stripe validates server-side)
      - Test mode → production confusion: separate environments strictly
    Risk: medium → review IAM for production Stripe key access
```

Actionable from this:
- Server-side amount validation
- Rate limit verification
- Strict Stripe key access controls

Total time: 30-60 minutes. Worth it for a payments path.

---

## Threat modelling for new features

Lightweight version, fits in a design review:

```
Section: Security considerations

What's the threat model?
  - What sensitive data does this touch?
  - Who can access this feature?
  - What's the worst case if compromised?

What mitigations are in place?
  - Auth + authz checks
  - Input validation
  - Logging
  - Rate limiting

What's not mitigated (residual risk)?
  - Acknowledge
  - Plan to address
```

5-paragraph addition to a design doc. Doesn't slow down work meaningfully.

---

## Common threat modelling failures

```
✗ Done once; never updated
✗ Done only for "important" systems (attack might come elsewhere)
✗ Lists threats but no mitigations
✗ Identifies mitigations but never verifies they exist
✗ Done by security team only (engineers don't see it)
✗ Treats security as compliance checklist
```

The best threat modelling: **engineers do it as part of design**, security team supports with frameworks and review.

---

## Anti-patterns

| Anti-pattern | Better |
|---|---|
| "We have a firewall" as security strategy | Defence in depth at every layer |
| Single source of credentials (one DB compromise = total) | Different keys/credentials per layer |
| Long-lived API keys | OIDC + short-lived tokens |
| Secrets in environment variables (built into image) | Runtime injection from secrets manager |
| Security as separate team disconnected from engineering | Embedded security engineers; threat models in design |
| Penetration tests once a year | Continuous scanning + bug bounty + pen tests + threat modelling |
| Logging "everything" without retention/protection | Targeted security logging; tamper-evident; encrypted |
| "Move fast" without security review | Threat model as part of design; not a separate step |
| Public S3 buckets, default open everything | Default deny; explicit allow |

---

## Quick reference

```
"We're starting a security program"     SOC 2 readiness; MFA; secrets manager; logging
"We need to threat model X"             STRIDE per component; mitigations; rate the risks
"Supply chain security"                 Sign artifacts; SBOMs; SLSA Level 2-3
"Service-to-service auth"               mTLS via service mesh; or workload identity
"Secrets management"                    Vault / Secrets Manager; runtime injection
"DDoS protection"                       Cloudflare / Shield + rate limiting + bulkhead
"Insider threat"                        Least privilege; JIT access; audit logs reviewed
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you think about security as architecture, not as a bolt-on.

**Strong answer pattern:**
1. STRIDE framework for systematic threat enumeration
2. Defence in depth: layers must be independent
3. Assume breach: design for lateral movement to be limited
4. Supply chain: sign artifacts, SBOMs, SLSA
5. Least privilege + just-in-time access > standing access
6. Logging is detection; you WILL be breached; speed of detection matters

**Common follow-up:** *"Walk me through threat modelling a new user-facing checkout endpoint."*
> Draw the flow first: user → API gateway → checkout service → payment service → Stripe. Identify trust boundaries: user/internal, internal/external (Stripe). For each component, run STRIDE. Most importantly: tampering of amount (need server-side validation), information disclosure (PII in logs scrubbed, card never touches us via tokenisation), DoS (rate limits per user and per IP), elevation of privilege (auth checks consistent across all paths). Document mitigations in the design doc. Verify implementation matches the model in code review. This isn't 30 minutes of overhead — it's 30 minutes that prevent expensive incidents.

---

## Related

- [Security index](index.md)
- [Authentication & Authorization](authn-authz.md)
- [Zero Trust](zero-trust.md)
- [Encryption](encryption.md)
- [Secrets Management](secrets-management.md)
- [API Security](api-security.md)
- [Security in CI/CD](../cicd/security-in-cicd.md)
- [Compliance & Regulatory Engineering](compliance-regulatory-engineering.md)
