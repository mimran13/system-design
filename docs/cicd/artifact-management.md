# Artifact Management

The output of CI is an **artifact** — a container image, a versioned package, a binary. Everything downstream (deploy, rollback, audit, security scanning) treats this artifact as the unit of work. How you build, name, store, and promote artifacts shapes whether deploys are reliable or chaotic.

---

## What an artifact is

An artifact is an immutable, addressable unit produced by CI:

| Type | Example | Stored in |
|---|---|---|
| Container image | `ghcr.io/org/app@sha256:abc...` | Image registry (ECR, GHCR, GCR) |
| OCI artifact | Helm chart, Wasm module, Tekton bundle | OCI registry |
| Language package | `npm`, `pypi`, `maven`, `cargo` | Package registry |
| Binary | Linux binary, Mac app | Object storage (S3) or release page |
| Bundle | tar.gz, zip with multiple files | Object storage |

Most modern systems converge on container images for deployable services and OCI registries for everything else.

---

## The immutability principle

```
Once built and tagged, an artifact never changes.
```

Why immutability matters:

- **Reproducible deploys.** "Deploy commit abc123" always means the same bytes.
- **Reliable rollback.** "Roll back to v1.2.3" works because v1.2.3 still exists.
- **Audit-able.** Provenance (what, when, who, how) is verifiable.
- **Cache-friendly.** Layers / blobs deduplicate aggressively.

Mutable tags violate this:

```
docker push myapp:latest    # changes meaning every build
docker push myapp:main      # same problem
```

`latest` and `main` should never be deployed to production. They're moving references.

---

## Tagging strategies

### Git SHA — the foundation

```bash
docker tag myapp myapp:$(git rev-parse HEAD)
docker push myapp:abc1234deadbeef...
```

Pros:
- Immutable (a SHA points to one commit forever)
- Traceable (image → commit → PR → reviewer → ticket)
- Unique (no collisions)

Cons:
- Hard for humans to read
- No version semantics

### Semantic versioning

```bash
docker tag myapp myapp:1.2.3
docker tag myapp myapp:1.2
docker tag myapp myapp:1
```

For libraries, SDKs, packages — semver communicates compatibility:

- `1.2.3 → 1.2.4` — bug fix
- `1.2.x → 1.3.0` — backward-compatible feature
- `1.x → 2.0.0` — breaking change

### Combined: SHA + semver

```bash
# Every build
docker tag myapp myapp:$(git rev-parse HEAD)

# Releases
docker tag myapp myapp:1.2.3
docker tag myapp myapp:1.2
```

Use SHA for deploy traceability; use semver for human reference.

### Digest references (stronger than tags)

```bash
# Tag — mutable
docker pull myapp:1.2.3

# Digest — cryptographic, immutable
docker pull myapp@sha256:abc1234...
```

Tags can theoretically be moved (registry permissions allowing). Digests cannot — they're content-addressed.

In production deploys, **prefer digests over tags**:

```yaml
spec:
  containers:
    - name: app
      image: myapp@sha256:abc1234deadbeef0987654321...
```

Kubernetes resolves digests once at deploy and locks the running version.

### What never to use in production

- `latest` — moving target
- Branch names (`main`, `develop`) — moving targets
- `prod`, `release` — moving targets
- Date-based (`20240101`) without SHA — multiple builds same day

---

## Container registries

| Registry | Provider | Notes |
|---|---|---|
| ECR | AWS | Tight IAM integration, AWS-native |
| GHCR | GitHub | Free for public, integrates with Actions |
| GCR / Artifact Registry | Google | GCP-native |
| ACR | Azure | Azure-native |
| Docker Hub | Docker | Public default; private tier paid |
| JFrog Artifactory | JFrog | Multi-format (Docker, npm, Maven, etc.) |
| Harbor | CNCF (self-hosted) | Open-source, scanning, signing |

For most teams: pick the registry your cloud uses. Multi-cloud → Artifactory or Harbor.

### Authentication

```yaml
# ECR with OIDC
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123:role/ci-push
    aws-region: us-east-1

- uses: aws-actions/amazon-ecr-login@v2

- run: |
    docker build -t $REGISTRY/myapp:${{ github.sha }} .
    docker push $REGISTRY/myapp:${{ github.sha }}
```

```yaml
# GHCR with built-in token
- uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

---

## Repository structure within registry

```
ghcr.io/myorg/
├── order-service/                     # one image per service
│   ├── tags: abc1234, 1.2.3, 1.2, 1
├── payment-service/
├── shared-base-image/                 # base images for reuse
└── helm-charts/
    ├── order-service:1.2.3            # Helm chart as OCI artifact
    └── payment-service:1.5.0
```

Conventions:

- One repo per artifact type per service
- Base images in their own repo (versioned independently)
- Helm charts and other OCI artifacts in dedicated repos

---

## Image layers and size

Container images are made of layers. Layer caching speeds builds; smaller layers speed pulls.

```dockerfile
FROM python:3.11-slim                   # ~100 MB

RUN apt-get update && apt-get install -y \
    libpq-dev && \
    rm -rf /var/lib/apt/lists/*         # cleanup in same layer

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt   # don't cache pip downloads

COPY src/ ./src/
```

Layer optimisation:

- Combine related `RUN` commands (fewer layers)
- Clean up in the same layer that creates files (deletion in a later layer doesn't shrink size)
- Use `--no-cache-dir` for pip/npm
- Use `-slim` or `-alpine` base images
- Multi-stage builds — discard build deps

### Image size targets

| Image type | Target |
|---|---|
| Statically compiled (Go, Rust binary) | < 20 MB |
| Python/Node service | 100-300 MB |
| Java service | 200-500 MB |
| ML model serving | 1-2 GB |

Bloated images cost network, storage, and pull time on every deploy.

---

## Artifact promotion

Artifacts move through environments — but the artifact itself doesn't change.

```
CI builds image → registry
   │
   ├─► dev: deploy image:abc1234
   │     → smoke tests pass
   │
   ├─► staging: deploy SAME image:abc1234
   │     → integration tests pass
   │
   └─► production: deploy SAME image:abc1234
        → live with users
```

The image **bytes are identical** across environments. What differs is configuration (env vars, secrets, replica counts).

Anti-pattern: building per-environment images.

```bash
# WRONG
docker build --build-arg ENV=staging -t app:staging .
docker build --build-arg ENV=production -t app:prod .
# Different artifacts → staging never tested what prod runs
```

If staging passed, production is the same artifact. Configuration is injected at runtime.

---

## Versioning packages (npm, PyPI, etc.)

Package registries enforce immutability:

```bash
# First publish
npm publish my-lib@1.2.3   # creates immutable version

# Cannot republish 1.2.3
npm publish my-lib@1.2.3   # ERROR: cannot overwrite

# Must increment
npm publish my-lib@1.2.4   # OK
```

For private packages:

| Tool | Registry option |
|---|---|
| npm | npmjs.com (public) or npm Enterprise |
| pip | PyPI (public) or AWS CodeArtifact, JFrog, devpi |
| Maven | Maven Central (public) or Nexus, JFrog |
| cargo | crates.io (public) or Cloudsmith, JFrog |
| NuGet | NuGet.org (public) or Azure Artifacts, GitHub Packages |

Most modern teams use cloud-managed registries (AWS CodeArtifact, GitHub Packages) for private deps.

---

## Retention and cleanup

Registries fill up. Set lifecycle policies.

### ECR lifecycle policy

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 10 production tags",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["v"],
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Expire untagged images after 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": { "type": "expire" }
    }
  ]
}
```

Rules of thumb:

- Keep last N production releases (rollback window)
- Keep last 30 days of dev/staging builds
- Expire untagged within 7 days
- Never auto-delete `v*` tagged production images

---

## Image signing and provenance

### Sigstore / cosign

```bash
# Sign image
cosign sign --yes ghcr.io/myorg/myapp@sha256:abc...

# Verify signature at deploy
cosign verify ghcr.io/myorg/myapp@sha256:abc... \
  --certificate-identity https://github.com/myorg/myapp/.github/workflows/ci.yml@refs/heads/main
```

cosign uses keyless signing — the signing key is derived from the OIDC token. No long-lived keys to manage.

### SLSA provenance

```yaml
- uses: actions/attest-build-provenance@v1
  with:
    subject-name: ghcr.io/myorg/myapp
    subject-digest: sha256:abc...
```

Generates a verifiable record of:
- What source repo + commit
- What workflow built it
- What dependencies were used
- When and where it ran

At deploy, verify provenance:

```bash
gh attestation verify --owner myorg image.tar
```

Critical for supply-chain security. See [Security in CI/CD](security-in-cicd.md).

---

## SBOM (Software Bill of Materials)

A list of every dependency in the artifact:

```bash
syft myapp:abc... -o spdx-json > sbom.json
```

SBOM enables:

- Vulnerability scanning against the artifact
- Licence compliance
- Incident response (which images contain log4j?)

Attach SBOM as an OCI artifact alongside the image:

```bash
cosign attach sbom --sbom sbom.json myapp@sha256:abc...
```

---

## Deploy-time verification

```yaml
# Admission policy in K8s — only signed images allowed
- name: Verify image
  run: |
    cosign verify $IMAGE \
      --certificate-identity-regexp '^https://github.com/myorg/' \
      --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Tools: Kyverno, Sigstore Policy Controller, Anchore.

---

## Pulling from private registries in K8s

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ecr-credentials
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: <base64>
```

Or use IAM roles for service accounts (IRSA on EKS):

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123:role/app-ecr-pull
```

No imagePullSecrets needed — the kubelet uses the service account's IAM role.

---

## Anti-patterns

| Anti-pattern | Why it breaks |
|---|---|
| Deploying `:latest` | Non-deterministic, unrollback-able |
| Per-environment images (`app:prod`) | Different artifacts, lost test signal |
| No retention policy | Registry storage fills up; costs balloon |
| Mutable tags (overwriting `:1.2.3`) | Breaks reproducibility, audit trail |
| Building dev artifacts on the fly during prod deploy | Same problem; image must pre-exist |
| Stored long-lived registry credentials | Use OIDC; rotation overhead and leak risk |

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you treat artifacts as immutable units, not just files in a registry.

**Strong answer pattern:**
1. Tag with git SHA; semver alongside for releases; never `:latest` in prod
2. Build once, promote unchanged — same image bytes from staging to prod
3. Multi-stage Docker builds for small images; layer order for cache hits
4. Lifecycle policies prevent registry bloat
5. Sign images (cosign) and generate SBOMs/provenance for supply-chain security
6. Use digest references (`@sha256:...`) at deploy time for true immutability

**Common follow-up:** *"Why never build per-environment images?"*
> Because then staging and production are different artifacts. The thing you tested isn't the thing you ship. Configuration goes via env vars, secrets, ConfigMaps — injected at runtime — not baked into the image.

---

## Related topics

- [Build and Test](build-and-test.md) — what produces the artifact
- [Security in CI/CD](security-in-cicd.md) — image scanning, signing
- [Containers](../infrastructure/containers.md) — image internals
- [Deployment Strategies](deployment-strategies.md) — using artifacts in deploy
- [GitOps](gitops.md) — Git references the artifact tag/digest
