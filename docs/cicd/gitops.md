# GitOps

GitOps inverts the traditional CI/CD push model: instead of CI pushing changes outward to clusters, a controller running *inside* the target watches Git and pulls changes inward. Git becomes the single source of truth; the cluster reconciles toward it continuously.

---

## The core idea

```
Push model (traditional CI/CD):
  CI runs `kubectl apply` → cluster
  CI needs cluster credentials
  Cluster state ≠ Git state if CI fails halfway

GitOps (pull model):
  Controller in cluster watches Git → applies changes
  Cluster reaches OUT to Git, not the other way
  Cluster state continuously reconciles to Git state
```

The cluster never receives commands from outside. It pulls. This is the same shift Kubernetes made inside the cluster (controllers reconcile to desired state) — extended to deploys.

---

## Why GitOps

```
Without GitOps:
  - CI pipeline applies kubectl with credentials
  - Cluster state can drift from Git (manual kubectl, controller bugs)
  - Rollback = "redeploy old version" (re-apply old config)
  - No audit trail beyond CI logs

With GitOps:
  - Cluster state ALWAYS matches Git (controller continuously reconciles)
  - Drift is detected and auto-corrected
  - Rollback = `git revert`
  - Audit trail = `git log`
  - No cluster credentials in CI
```

The biggest practical win: **Git is the deploy log**. Every change has an author, timestamp, message, diff. Auditors love it; on-callers love it.

---

## The two repos pattern

```
app repo (source code):
  src/
  Dockerfile
  .github/workflows/ci.yml
    └─► builds image
        └─► pushes image to registry
            └─► updates image tag in config repo (PR or commit)

config repo (cluster state):
  k8s/
    order-service/
      deployment.yaml      ← image: myapp:abc1234
      service.yaml
      hpa.yaml
    payment-service/
  helm-values/
    order-service/
      production.yaml      ← image.tag: abc1234
```

Why split:

- App repo focuses on code; CI runs tests
- Config repo focuses on cluster state; controller watches it
- Different access control (app team vs platform team)
- Config repo is the "control plane" — every deploy is a commit

---

## ArgoCD

The most popular GitOps tool. Watches Git; reconciles cluster.

### Application manifest

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: order-service
  namespace: argocd
spec:
  project: production
  
  source:
    repoURL: https://github.com/myorg/k8s-config
    targetRevision: main
    path: k8s/order-service
  
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  
  syncPolicy:
    automated:
      prune: true        # delete resources removed from Git
      selfHeal: true     # revert manual kubectl changes
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

Modes:

- **Auto-sync + selfHeal**: cluster always matches Git (production)
- **Manual sync**: changes appear in ArgoCD UI; human clicks "Sync" (review-heavy envs)

### App-of-apps pattern

```yaml
# argocd-apps/root.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
spec:
  source:
    repoURL: https://github.com/myorg/argocd-apps
    path: apps
  syncPolicy:
    automated: {}
```

`apps/` directory contains Application manifests for every service. Adding a service = adding a YAML file.

### ApplicationSet

Templating for many similar apps:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: order-service-environments
spec:
  generators:
    - list:
        elements:
          - environment: dev
            cluster: dev-cluster
          - environment: staging
            cluster: staging-cluster
          - environment: production
            cluster: prod-cluster
  
  template:
    metadata:
      name: 'order-service-{{environment}}'
    spec:
      source:
        repoURL: https://github.com/myorg/k8s-config
        path: 'k8s/order-service/{{environment}}'
      destination:
        server: '{{cluster}}'
```

One ApplicationSet generates one Application per environment.

---

## Flux

Alternative to ArgoCD. Same principles, different ergonomics.

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: k8s-config
  namespace: flux-system
spec:
  url: https://github.com/myorg/k8s-config
  ref:
    branch: main
  interval: 1m

---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: order-service
  namespace: flux-system
spec:
  sourceRef:
    kind: GitRepository
    name: k8s-config
  path: ./k8s/order-service
  prune: true
  interval: 5m
```

| | ArgoCD | Flux |
|---|---|---|
| UI | Yes (rich) | No (use OCI) |
| Multi-tenancy | AppProjects | Namespaced |
| App-of-apps | App-of-apps, ApplicationSet | Kustomizations |
| Helm | Native | Native (HelmRelease CRD) |
| Config | More YAML | More CRDs |
| Best for | UI users, multi-cluster | Pure declarative, automation-heavy |

Both are mature and CNCF graduated. Pick based on team preference.

---

## The deploy flow

```
1. Engineer pushes code to app repo
   └─► CI builds image: myapp:abc1234
   └─► CI pushes to registry
   └─► CI updates image tag in config repo
       (commits to a branch, opens PR, or commits to main directly)

2. PR review on config repo (optional but recommended)
   └─► Reviewers see exact diff (image tag change)
   └─► CI on config repo runs validation (kubeval, opa, etc.)
   └─► Merge

3. ArgoCD detects new commit in config repo
   └─► Compares Git state to cluster state
   └─► Applies diff (kubectl apply equivalent)
   └─► Waits for resources to be healthy

4. ArgoCD reports sync status
   └─► Healthy → done
   └─► Failed → alert, optionally auto-rollback
```

The CI in the **app repo never touches the cluster**. It only updates the config repo. This means:

- No cluster credentials in app CI
- Compromised app CI cannot directly affect production
- Rollback is "git revert" in config repo

---

## Updating image tags from CI

Several patterns:

### 1. Direct commit to config repo

```yaml
# In app repo CI
- name: Update config repo
  run: |
    git clone https://github.com/myorg/k8s-config
    cd k8s-config
    sed -i "s|myapp:.*|myapp:${{ github.sha }}|" \
      k8s/order-service/deployment.yaml
    git commit -am "Update order-service to ${{ github.sha }}"
    git push
```

Simple but no review gate.

### 2. PR to config repo

```yaml
- uses: peter-evans/create-pull-request@v6
  with:
    token: ${{ secrets.CONFIG_REPO_TOKEN }}
    path: k8s-config
    commit-message: "Update order-service to ${{ github.sha }}"
    title: "Deploy order-service: ${{ github.sha }}"
    branch: deploy-order-service-${{ github.sha }}
```

PR is reviewed (or auto-merged); ArgoCD picks up after merge.

### 3. ArgoCD Image Updater

ArgoCD watches the registry; auto-updates manifests when new images appear.

```yaml
metadata:
  annotations:
    argocd-image-updater.argoproj.io/image-list: app=ghcr.io/myorg/myapp
    argocd-image-updater.argoproj.io/app.update-strategy: latest
```

Less Git-trail (no commit per deploy); some teams prefer this for low-stakes envs.

### 4. Helm chart values bump

```yaml
# helm-values/order-service/production.yaml
image:
  repository: ghcr.io/myorg/order-service
  tag: abc1234
```

Update the tag value; ArgoCD applies the Helm chart with new value.

---

## Multi-environment promotion

Each environment is its own Git path or branch:

```
config-repo/
├── envs/
│   ├── dev/
│   │   └── order-service.yaml         # image: myapp:abc1234
│   ├── staging/
│   │   └── order-service.yaml         # image: myapp:abc1234 (after staging promotion)
│   └── production/
│       └── order-service.yaml         # image: myapp:abc1234 (after prod promotion)
```

Promotion = PR that copies the image tag from one env file to the next.

```yaml
# Auto-PR from staging to production after staging soak
on:
  schedule:
    - cron: '0 14 * * 1-4'    # weekdays 14:00 UTC, after 24h soak

jobs:
  promote:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          staging_tag=$(yq '.image.tag' envs/staging/order-service.yaml)
          production_tag=$(yq '.image.tag' envs/production/order-service.yaml)
          if [ "$staging_tag" != "$production_tag" ]; then
            yq -i ".image.tag = \"$staging_tag\"" envs/production/order-service.yaml
          fi
      - uses: peter-evans/create-pull-request@v6
        with:
          title: "Promote order-service to production"
```

---

## Drift correction

ArgoCD's `selfHeal: true` reverts manual `kubectl` changes:

```bash
# Engineer manually edits a resource
kubectl edit deployment order-service -n production
# changes replicas: 3 → replicas: 10

# ArgoCD detects diff in next sync (within ~3 minutes)
# Reverts replicas to 3 (the value in Git)
```

For attributes managed elsewhere (e.g., HPA-controlled replicas), exclude from sync:

```yaml
spec:
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas    # HPA owns this
```

---

## Secrets and GitOps

GitOps wants everything in Git. Secrets shouldn't be — at least not in plaintext.

### Sealed Secrets (Bitnami)

```bash
echo -n "supersecret" | kubectl create secret generic mysecret \
  --dry-run=client --from-file=password=/dev/stdin -o yaml | \
  kubeseal -o yaml > sealed-mysecret.yaml
```

Sealed Secret is encrypted; only the cluster's controller can decrypt. Safe to commit.

### External Secrets Operator

Sync from cloud secrets manager:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-credentials
spec:
  secretStoreRef:
    name: aws-secrets
    kind: SecretStore
  target:
    name: db-credentials
  data:
    - secretKey: password
      remoteRef:
        key: production/order-service/db
        property: password
```

The CRD references a secret; the operator fetches and creates a real Kubernetes Secret. The CRD is safe to commit.

### SOPS + age/KMS

Encrypt secrets in Git with SOPS; ArgoCD or Flux decrypts at apply.

```yaml
# secrets.enc.yaml — encrypted at rest in Git
apiVersion: v1
kind: Secret
data:
  password: ENC[AES256_GCM,data:abc...,tag:def...]
sops:
  kms:
    - arn: arn:aws:kms:us-east-1:123:key/abc-def
```

Pick one — Sealed Secrets is simplest, External Secrets is most flexible.

---

## Observability for GitOps

Track:

- Sync status per Application (synced / out-of-sync / progressing)
- Sync duration
- Time from Git commit to "healthy" in cluster
- Self-heal events (drift detected, drift corrected)
- Failed syncs (alerts)

ArgoCD exports Prometheus metrics:

```
argocd_app_info
argocd_app_sync_total
argocd_app_health_status
```

Dashboards: lead time from commit to deploy, deploy frequency, change-failure rate.

---

## When NOT to use GitOps

- **Highly imperative workflows** — DB migrations with ordering, multi-step rollouts requiring orchestration
- **Non-Kubernetes infrastructure** — GitOps tools mostly target K8s; cloud infra usually goes through Terraform CI/CD
- **Tiny teams without K8s already** — overhead exceeds benefit

GitOps shines when you're K8s-native and have many services. For small teams or non-K8s workloads, traditional CI/CD with `terraform apply` is simpler.

---

## Pitfalls

| Pitfall | Mitigation |
|---|---|
| Config repo becomes huge | Split per environment or per team |
| Secrets in plaintext | Sealed Secrets / ESO / SOPS |
| Long sync intervals (slow deploys) | Lower the polling interval; use webhooks |
| App CI directly modifying main of config repo | PR-based update with review |
| Two sources of truth (Helm chart vs values vs ArgoCD config) | Document which is canonical; don't edit by hand |
| ArgoCD itself self-managed by ArgoCD | Bootstrap problem — use a second ArgoCD or `kubectl apply` for the controller itself |

---

## Comparison: GitOps vs traditional CI/CD

| | Traditional push CI/CD | GitOps pull |
|---|---|---|
| Cluster credentials in CI | Yes | No |
| Source of truth | Logs of last apply | Git always |
| Rollback | Re-deploy old image | `git revert` |
| Drift correction | Manual (re-apply) | Automatic (controller) |
| Audit trail | CI logs | `git log` |
| Multi-cluster | One pipeline per cluster | One controller per cluster, one Git repo |
| Best for | All workloads | K8s workloads |

Most modern teams use **both**: GitOps for K8s app deploys, traditional CI/CD (`terraform apply`) for cloud infra.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you grasp the inversion: control flow comes from inside, not outside.

**Strong answer pattern:**
1. Cluster pulls from Git instead of CI pushing to cluster
2. Eliminates cluster credentials in CI; smaller blast radius
3. Drift detection and auto-correction included for free
4. Rollback = git revert; audit = git log
5. Two repos: app code + config; CI in app updates config repo
6. ArgoCD or Flux; both CNCF graduated, both fine

**Common follow-up:** *"What's the downside of GitOps?"*
> Two-repo cognitive overhead, learning curve for ArgoCD/Flux, secrets handling needs extra tools (Sealed Secrets / External Secrets), and bootstrap problem (the controller itself needs to be deployed by something). For small teams without K8s, the overhead exceeds the benefit.

---

## Related topics

- [Fundamentals](fundamentals.md) — push vs pull
- [Pipelines](pipelines.md) — traditional CI/CD comparison
- [Deployment Strategies](deployment-strategies.md) — Argo Rollouts integrates with ArgoCD
- [Progressive Delivery](progressive-delivery.md) — Flagger and Argo Rollouts
- [Kubernetes](../infrastructure/kubernetes.md) — the target
- [Secrets Management](../security/secrets-management.md) — Sealed Secrets, ESO
