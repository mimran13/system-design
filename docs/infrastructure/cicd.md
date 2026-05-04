# CI/CD

## What it is

CI/CD (Continuous Integration / Continuous Delivery) is the practice of automating the build, test, and deployment pipeline so that every code change is verified and deployable with minimal manual steps.

```
Without CI/CD:
  Developer writes code
  → "It works on my machine"
  → Manual testing (takes days)
  → Manual deployment (error-prone)
  → Deployment happens once a quarter (big bang, high risk)

With CI/CD:
  Developer pushes code
  → Automated: lint, test, security scan, build (minutes)
  → Automated: deploy to staging, run integration tests
  → Automated: deploy to production (with approval gate)
  → Deploy dozens of times per day (small, low risk)
```

## The pipeline

```mermaid
graph LR
    A[Git Push] --> B[CI Server]
    B --> C[Lint & Type Check]
    C --> D[Unit Tests]
    D --> E[Build Image]
    E --> F[Security Scan]
    F --> G[Push to Registry]
    G --> H{Branch?}
    H -->|main| I[Deploy Staging]
    I --> J[Integration Tests]
    J --> K{Pass?}
    K -->|yes| L[Deploy Production]
    K -->|no| M[Alert & Stop]
    H -->|feature| N[Preview Environment]
```

## Continuous Integration

The CI part: every push triggers automated verification.

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  IMAGE_NAME: order-service
  ECR_REGISTRY: 123456789.dkr.ecr.us-east-1.amazonaws.com

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: test_orders
          POSTGRES_PASSWORD: password
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
          cache: 'pip'
      
      - name: Install dependencies
        run: pip install -r requirements.txt -r requirements-dev.txt
      
      - name: Lint
        run: |
          ruff check .
          mypy src/
      
      - name: Run tests
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/test_orders
        run: |
          pytest tests/ \
            --cov=src \
            --cov-report=xml \
            --cov-fail-under=80 \
            -v
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
  
  build:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    
    permissions:
      id-token: write  # for OIDC auth with AWS
      contents: read
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/github-actions-role
          aws-region: us-east-1
      
      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2
      
      - name: Build and push image
        env:
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build \
            --cache-from $ECR_REGISTRY/$IMAGE_NAME:latest \
            --tag $ECR_REGISTRY/$IMAGE_NAME:$IMAGE_TAG \
            --tag $ECR_REGISTRY/$IMAGE_NAME:latest \
            .
          docker push $ECR_REGISTRY/$IMAGE_NAME:$IMAGE_TAG
          docker push $ECR_REGISTRY/$IMAGE_NAME:latest
      
      - name: Scan image for vulnerabilities
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.ECR_REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          exit-code: '1'              # fail if CRITICAL vulnerabilities found
          severity: 'CRITICAL,HIGH'
      
      - name: Output image tag
        id: image
        run: echo "tag=${{ github.sha }}" >> $GITHUB_OUTPUT
    
    outputs:
      image-tag: ${{ steps.image.outputs.tag }}
```

### AWS OIDC (no stored credentials)

```yaml
# GitHub Actions → AWS without long-lived credentials
# Trust policy on IAM role:
{
  "Principal": {
    "Federated": "arn:aws:iam::123456789:oidc-provider/token.actions.githubusercontent.com"
  },
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:sub": "repo:myorg/myrepo:ref:refs/heads/main"
    }
  }
}
```

## Continuous Delivery

### Deploy to ECS

```yaml
  deploy-staging:
    runs-on: ubuntu-latest
    needs: build
    environment: staging  # GitHub environment with protection rules
    
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/github-actions-deploy-role
          aws-region: us-east-1
      
      - name: Download task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition order-service \
            --query taskDefinition > task-definition.json
      
      - name: Update task definition image
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-definition.json
          container-name: order-service
          image: ${{ env.ECR_REGISTRY }}/order-service:${{ needs.build.outputs.image-tag }}
      
      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: order-service-staging
          cluster: staging
          wait-for-service-stability: true  # wait for rolling update to complete
  
  deploy-production:
    runs-on: ubuntu-latest
    needs: [build, deploy-staging]
    environment: production  # requires manual approval
    
    steps:
      # Same as staging but targeting production cluster
      ...
```

### Deploy to Kubernetes

```yaml
  deploy-k8s:
    steps:
      - name: Update K8s deployment
        run: |
          # Option 1: kubectl set image (direct)
          kubectl set image deployment/order-service \
            order-service=$ECR_REGISTRY/order-service:$IMAGE_TAG \
            --namespace production
          
          kubectl rollout status deployment/order-service \
            --namespace production \
            --timeout=5m
        
        # Option 2: Update Helm chart values
        # helm upgrade order-service ./helm/order-service \
        #   --set image.tag=$IMAGE_TAG \
        #   --namespace production \
        #   --wait
        
        # Option 3: GitOps (ArgoCD/Flux) — preferred
        # Update image tag in values file → ArgoCD detects and syncs
```

## GitOps (ArgoCD)

GitOps = Git is the single source of truth for cluster state. No `kubectl apply` in CI:

```
Git repo (config):           Kubernetes cluster:
  k8s/
    order-service/
      deployment.yaml  ──►  ArgoCD watches → applies changes
      service.yaml
      ingress.yaml

CI pipeline:
  1. Build image
  2. Update image tag in k8s/order-service/deployment.yaml
  3. Commit and push
  4. ArgoCD detects diff → syncs cluster

Benefits:
  - Cluster state always matches Git (drift detection)
  - Rollback = revert Git commit
  - Audit trail = Git history
  - No cluster credentials in CI
```

```yaml
# ArgoCD Application
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
      prune: true        # remove resources deleted from Git
      selfHeal: true     # revert manual kubectl changes
    syncOptions:
      - CreateNamespace=true
```

## Testing in CI

```python
# Pyramid: many unit tests, fewer integration, few e2e

# Unit tests: fast, isolated, no dependencies
def test_calculate_order_total():
    order = Order(items=[
        OrderItem(price_cents=1000, quantity=2),
        OrderItem(price_cents=500, quantity=1),
    ])
    assert order.calculate_total() == 2500

# Integration tests: real DB, real Redis
@pytest.mark.integration
async def test_create_order_persists(db, redis):
    order = await order_service.create(CreateOrderRequest(...))
    
    # Verify in DB
    saved = await db.get_order(order.id)
    assert saved.status == OrderStatus.PENDING
    
    # Verify event published
    event = await redis.lpop("order:events")
    assert json.loads(event)["type"] == "order.created"

# Contract tests: verify API contract between services
# (Pact library for consumer-driven contracts)
```

## Quality gates

CI should fail on:

```yaml
# Required gates before merge
quality_gates:
  - lint_passes: true
  - type_check_passes: true
  - test_coverage: ">= 80%"
  - security_scan: "no CRITICAL vulnerabilities"
  - dependency_audit: "no known vulnerabilities"

# PR rules in GitHub:
# Required status checks: ci/test, ci/build, ci/security-scan
# Require at least 1 review
# Dismiss stale reviews on new commits
# Require branches to be up to date
```

## AWS CodePipeline alternative

Native AWS CI/CD:

```
Source (CodeCommit/GitHub) 
  → Build (CodeBuild: runs tests, builds image)
  → Deploy Staging (CodeDeploy/ECS deploy)
  → Approval (manual gate)
  → Deploy Production (CodeDeploy with blue/green)
```

```python
# CodeBuild buildspec.yml
version: 0.2

phases:
  install:
    runtime-versions:
      python: 3.11
  
  pre_build:
    commands:
      - pip install -r requirements.txt
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
  
  build:
    commands:
      - pytest tests/ --cov=src --cov-fail-under=80
      - docker build -t $ECR_REGISTRY/$IMAGE_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION .
  
  post_build:
    commands:
      - docker push $ECR_REGISTRY/$IMAGE_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - printf '[{"name":"order-service","imageUri":"%s"}]' \
          $ECR_REGISTRY/$IMAGE_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION \
          > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
```

## Interview angle

!!! tip "What interviewers are testing"
    CI/CD comes up in "how do you ship changes safely?"

**Strong answer pattern:**
1. CI: every push → lint, test, build, scan — fast feedback, fail early
2. CD: every merge to main → auto-deploy staging, manual approval for production
3. Image tagging: use git SHA, not `latest` — immutable, traceable
4. OIDC for AWS auth — no long-lived credentials in CI environment
5. GitOps (ArgoCD) for K8s — Git is the source of truth, no cluster creds in CI

## Related topics

- [Containers](containers.md) — what CI/CD builds and deploys
- [Kubernetes](kubernetes.md) — deploy target
- [Deployments](deployments.md) — rolling, blue/green, canary strategies
- [IaC](iac.md) — infrastructure provisioned by pipeline too
