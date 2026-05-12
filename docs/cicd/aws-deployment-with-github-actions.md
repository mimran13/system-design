---
tags:
  - aws-native
  - applied
---

# AWS Deployment via GitHub Actions (end-to-end)

A complete walkthrough: from zero to GitHub Actions deploying to AWS using **OIDC** (no stored AWS access keys). Covers the one-time IAM setup, three common deployment flows (app deploy, Terraform apply, container build & push), and how to debug the inevitable trust-policy errors.

This page assumes you're starting fresh. If you already have OIDC set up, jump to the [flows section](#flow-1-deploy-an-app-to-ecs).

---

## End-to-end flow at a glance

```mermaid
graph LR
    subgraph "Developer"
        Code[Write code]
    end
    
    subgraph "GitHub"
        PR[Open PR]
        Review[Review]
        Merge[Merge to main]
    end
    
    subgraph "GitHub Actions"
        CI[Run tests]
        OIDC1[OIDC: plan role]
        Plan[terraform plan]
        Comment[Post plan on PR]
        OIDC2[OIDC: apply role]
        Apply[terraform apply]
        OIDC3[OIDC: deploy role]
        Build[Build container]
        Push[Push to ECR]
        Deploy[ECS deploy]
    end
    
    subgraph "AWS"
        STS[STS<br/>validates JWT]
        ECR[ECR registry]
        ECS[ECS service]
        Users[Users]
    end
    
    Code --> PR
    PR --> CI
    CI --> OIDC1
    OIDC1 -.JWT.-> STS
    STS -.temp creds.-> Plan
    Plan --> Comment
    Comment --> Review
    Review --> Merge
    
    Merge --> OIDC2
    OIDC2 -.JWT.-> STS
    STS -.temp creds.-> Apply
    Apply -->|infra updated| OIDC3
    
    OIDC3 -.JWT.-> STS
    STS -.temp creds.-> Build
    Build --> Push
    Push --> ECR
    ECR --> Deploy
    Deploy --> ECS
    ECS --> Users
    
    style OIDC1 fill:#fff4e1
    style OIDC2 fill:#ffe1e1
    style OIDC3 fill:#e1ffe1
    style STS fill:#e1f5ff
```

Three OIDC handshakes, each with a different IAM role scoped to its job. From a developer's PR to running in production. **No AWS keys anywhere.**

---

## Why OIDC, not access keys

Two ways to give GitHub Actions permission to do things in AWS:

| Method | How it works | Problem |
|---|---|---|
| **Long-lived access keys** | Create IAM user → store keys in GitHub Secrets | Keys leak, never rotate, compromise = total AWS access |
| **OIDC (federated identity)** | GitHub issues a short-lived token; AWS verifies it; grants temporary role | No long-lived secrets; scoped to specific repo + branch |

OIDC is the modern standard. The setup is one-time; benefits are permanent.

---

## The big picture — OIDC handshake

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant GH as GitHub Actions
    participant OIDC as GitHub OIDC Provider
    participant STS as AWS STS
    participant AWS as AWS Resources

    Dev->>GH: git push main
    activate GH
    Note over GH: Workflow starts<br/>permissions: id-token: write

    GH->>OIDC: Request signed JWT<br/>(audience: sts.amazonaws.com)
    OIDC-->>GH: JWT with claims<br/>{sub: repo:org/repo:ref:refs/heads/main}

    GH->>STS: AssumeRoleWithWebIdentity<br/>(role-arn, JWT)
    activate STS
    Note over STS: Validate JWT signature<br/>Check trust policy:<br/>- Issuer = GitHub?<br/>- sub matches pattern?
    STS-->>GH: Short-lived credentials<br/>(~1 hour)
    deactivate STS

    GH->>AWS: API calls with credentials<br/>(ecr push, ecs deploy, etc.)
    AWS-->>GH: Success
    deactivate GH
    GH-->>Dev: Deploy complete
```

**Key takeaway**: no long-lived AWS keys stored anywhere. Trust is bound to **the specific repo + branch + workflow** via the JWT's `sub` claim, validated by AWS against your IAM role's trust policy.

---

## One-time AWS setup (using Terraform)

Run this Terraform **once per AWS account** that you'll deploy to. This creates the OIDC trust + the IAM roles your workflows will assume.

### What you're building

```mermaid
graph TB
    subgraph "AWS Account"
        OIDC[OIDC Identity Provider<br/>token.actions.githubusercontent.com]
        
        subgraph "IAM Roles"
            R1[github-actions-plan-prod<br/>read-only]
            R2[github-actions-apply-prod<br/>write infra]
            R3[github-actions-deploy-prod<br/>ECS + ECR]
        end
        
        subgraph "Resources Each Role Can Touch"
            P1[Plan: Describe* Get* List* only]
            P2[Apply: VPC, RDS, ECS, IAM<br/>everything in this env]
            P3[Deploy: ECR push, ECS update,<br/>specific PassRole only]
        end
        
        R1 -.permissions.-> P1
        R2 -.permissions.-> P2
        R3 -.permissions.-> P3
    end
    
    subgraph "GitHub"
        Repo[myorg/myrepo]
        PR[Pull Request workflow]
        Main[push to main workflow]
        Env[GitHub Environment: production<br/>required reviewer: alice]
    end
    
    PR -..->|"sub: repo:.../pull_request"| R1
    Main -..->|"sub: repo:.../ref:refs/heads/main"| R2
    Env -..->|"sub: repo:.../environment:production"| R3
    
    R1 -.trusts.-> OIDC
    R2 -.trusts.-> OIDC
    R3 -.trusts.-> OIDC
    
    style OIDC fill:#e1f5ff
    style R1 fill:#fff4e1
    style R2 fill:#ffe1e1
    style R3 fill:#e1ffe1
```

The pattern: **one OIDC provider, multiple roles**, each scoped to a specific workflow trigger + specific permission set. Goes from "GitHub can do anything in AWS" to "this specific branch can do this specific thing."

### Step 1: Create the GitHub OIDC identity provider in AWS

This tells AWS "trust tokens issued by GitHub."

```hcl
# github-oidc.tf

# Get GitHub's TLS certificate thumbprint
data "tls_certificate" "github" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = data.tls_certificate.github.certificates[*].sha1_fingerprint
}
```

You create this **once per AWS account**. All future roles reference it.

### Step 2: Create a deployment role (per environment)

This is the role GitHub Actions will assume. The trust policy is the key part — it locks down **which repo + branch + workflow** can assume it.

```hcl
# github-actions-roles.tf

variable "github_org" { default = "myorg" }
variable "github_repo" { default = "myrepo" }

# Role assumable by GitHub Actions running on main branch
resource "aws_iam_role" "github_actions_deploy" {
  name = "github-actions-deploy-production"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          # The CRITICAL line: locks role to a specific repo + branch
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/main"
        }
      }
    }]
  })
}

# Attach permissions to the role — what it's allowed to do
resource "aws_iam_role_policy" "github_actions_deploy" {
  name = "deploy-permissions"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # ECR push
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
        ]
        Resource = "*"
      },
      # ECS deploy
      {
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
        ]
        Resource = "*"
      },
      # PassRole for ECS task role (only the specific roles ECS needs)
      {
        Effect = "Allow"
        Action = "iam:PassRole"
        Resource = [
          aws_iam_role.ecs_task_execution.arn,
          aws_iam_role.ecs_task.arn,
        ]
      },
    ]
  })
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions_deploy.arn
}
```

### Step 3: Important — the `sub` claim patterns

The `sub` claim is the security boundary. **Get this wrong and you have a security hole.**

```hcl
# ONLY main branch of one repo (most common)
"token.actions.githubusercontent.com:sub" = "repo:myorg/myrepo:ref:refs/heads/main"

# Pull requests of one repo (use for plan-only roles)
"token.actions.githubusercontent.com:sub" = "repo:myorg/myrepo:pull_request"

# Any branch matching a pattern
"token.actions.githubusercontent.com:sub" = "repo:myorg/myrepo:ref:refs/heads/release/*"

# A specific GitHub environment (for protection rules)
"token.actions.githubusercontent.com:sub" = "repo:myorg/myrepo:environment:production"

# Tag pushes (release deploys)
"token.actions.githubusercontent.com:sub" = "repo:myorg/myrepo:ref:refs/tags/v*"

# Multiple repos under one org (use StringLike, not StringEquals)
# Condition = {
#   StringLike = {
#     "token.actions.githubusercontent.com:sub" = "repo:myorg/*:ref:refs/heads/main"
#   }
# }
```

**Common mistakes**:

- Using `StringLike` with `*` everywhere → too permissive
- Forgetting `:ref:refs/heads/` prefix → claim never matches
- Mixing `pull_request` and `ref:refs/heads/*` in one role → use separate roles

### Step 4: Apply the Terraform

```bash
terraform init
terraform plan
terraform apply
```

After apply, note the output:

```
github_actions_role_arn = "arn:aws:iam::123456789012:role/github-actions-deploy-production"
```

You'll use this ARN in every GitHub Actions workflow.

---

## Recommended IAM role structure

Don't have one omnipotent role. Have **multiple roles per environment**, each with minimum permissions:

```
github-actions-plan-dev               (Terraform plan, read-only)
github-actions-apply-dev              (Terraform apply, create/modify)
github-actions-deploy-dev             (ECS deploy, ECR push)

github-actions-plan-staging
github-actions-apply-staging
github-actions-deploy-staging

github-actions-plan-production        (read-only — anyone can review)
github-actions-apply-production       (write — gated by environment protection rules)
github-actions-deploy-production      (deploy — gated by environment)
```

Each role's trust policy specifies *which branch / environment / event* can assume it. PR runs get plan; main merges get apply; production gets manual approval via GitHub Environments.

---

## Flow 1: Deploy an app to ECS

The most common flow. Code change → build container → push to ECR → update ECS service.

### Diagram

```mermaid
sequenceDiagram
    participant Dev
    participant GH as GitHub Actions
    participant STS as AWS STS
    participant ECR
    participant ECS
    participant ALB
    participant Users

    Dev->>GH: git push main
    GH->>STS: AssumeRole via OIDC
    STS-->>GH: temp credentials

    Note over GH: Build container image
    GH->>ECR: ecr get-login-password
    ECR-->>GH: auth token
    GH->>ECR: docker push myapp:abc1234
    ECR-->>GH: pushed

    Note over GH: Update ECS service
    GH->>ECS: describe-task-definition
    ECS-->>GH: current task def
    Note over GH: Render new task def<br/>with image:abc1234
    GH->>ECS: register-task-definition
    ECS-->>GH: new revision: 42
    GH->>ECS: update-service<br/>(new task def)
    
    Note over ECS: Rolling deploy<br/>start new tasks<br/>health check<br/>drain old tasks
    ECS->>ALB: register new targets
    ALB->>ECS: health check OK
    ALB-->>Users: route to new version
    ECS-->>GH: services-stable

    GH-->>Dev: ✓ deployed
```

```yaml
# .github/workflows/deploy.yml
name: Deploy to ECS

on:
  push:
    branches: [main]

permissions:
  id-token: write       # REQUIRED for OIDC
  contents: read

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: order-service
  ECS_CLUSTER: production
  ECS_SERVICE: order-service

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production    # GitHub Environment with required reviewers
    
    steps:
      - uses: actions/checkout@v4

      # 1. Assume AWS role via OIDC
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-deploy-production
          aws-region: ${{ env.AWS_REGION }}

      # 2. Login to ECR (uses the assumed role)
      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      # 3. Build and push image
      - name: Build and push image
        env:
          REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          echo "image=$REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT
        id: build

      # 4. Update ECS task definition with new image
      - name: Download current task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition $ECS_SERVICE \
            --query taskDefinition > task-definition.json

      - name: Update image in task definition
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-definition.json
          container-name: ${{ env.ECS_SERVICE }}
          image: ${{ steps.build.outputs.image }}

      # 5. Deploy
      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: ${{ env.ECS_SERVICE }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true
```

That's a complete production deploy. No AWS keys anywhere; auth is via OIDC.

### Adding canary or blue/green

ECS supports both. The deployment configuration is in the task definition or via CodeDeploy. See [Deployment Strategies](deployment-strategies.md) and [Progressive Delivery](progressive-delivery.md).

---

## Flow 2: Run Terraform in CI

The full lifecycle: PR opens → plan posted as comment → review → merge → apply.

### Diagram

```mermaid
graph TB
    Dev[Developer opens PR]
    Dev --> PR[PR workflow triggered]
    
    PR --> PlanAuth[Assume plan-role via OIDC<br/>READ-ONLY permissions]
    PlanAuth --> Init[terraform init<br/>connects to S3 state backend]
    Init --> Plan[terraform plan]
    Plan --> Comment[Post plan as PR comment]
    Comment --> Review{Reviewer<br/>approves?}
    
    Review -->|no| Iterate[Make changes; new commit]
    Iterate --> PR
    
    Review -->|yes| Merge[Merge to main]
    Merge --> Apply[Apply workflow triggered]
    
    Apply --> ApplyAuth[Assume apply-role via OIDC<br/>WRITE permissions]
    ApplyAuth --> Lock[Acquire state lock<br/>in DynamoDB]
    Lock --> Replan[terraform plan -detailed-exitcode<br/>state may have changed]
    Replan --> Approve{GitHub Environment<br/>requires reviewer}
    Approve -->|approved| RealApply[terraform apply]
    Approve -->|rejected| Cancel[Workflow cancelled]
    
    RealApply --> Update[Resources created/updated]
    Update --> Unlock[Release state lock]
    Unlock --> Notify[Slack notification]
    
    style PlanAuth fill:#fff4e1
    style ApplyAuth fill:#ffe1e1
    style Approve fill:#e1f5ff
```

### PR workflow — plan only, read-only role

```yaml
# .github/workflows/terraform-plan.yml
name: Terraform Plan

on:
  pull_request:
    paths: ['infra/**']

permissions:
  id-token: write
  contents: read
  pull-requests: write    # to comment on PR

jobs:
  plan:
    runs-on: ubuntu-latest
    
    defaults:
      run:
        working-directory: infra/environments/production

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.7.0

      # Plan role is READ-ONLY — safe even if PR is from a fork
      - name: AWS OIDC auth (plan role)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-plan-production
          aws-region: us-east-1

      - name: terraform init
        run: terraform init

      - name: terraform validate
        run: terraform validate

      - name: terraform plan
        id: plan
        run: |
          terraform plan -no-color -out=tfplan -var-file=terraform.tfvars
          terraform show -no-color tfplan > plan.txt
        continue-on-error: true

      - name: Post plan as PR comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const plan = fs.readFileSync('infra/environments/production/plan.txt', 'utf8');
            const truncated = plan.length > 60000 ? plan.slice(0, 60000) + '\n... (truncated)' : plan;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `### Terraform Plan: production\n\n\`\`\`hcl\n${truncated}\n\`\`\``
            });
```

### Apply workflow — runs on merge to main

```yaml
# .github/workflows/terraform-apply.yml
name: Terraform Apply

on:
  push:
    branches: [main]
    paths: ['infra/**']

permissions:
  id-token: write
  contents: read

concurrency:
  group: terraform-apply-production
  cancel-in-progress: false   # NEVER cancel an in-progress apply

jobs:
  apply:
    runs-on: ubuntu-latest
    environment: production   # Manual approval required via GitHub Environment

    defaults:
      run:
        working-directory: infra/environments/production

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.7.0

      # Apply role has WRITE permissions
      - name: AWS OIDC auth (apply role)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-apply-production
          aws-region: us-east-1

      - name: terraform init
        run: terraform init

      # Re-plan to confirm; state may have changed since PR
      - name: terraform plan
        id: plan
        run: terraform plan -out=tfplan -var-file=terraform.tfvars -detailed-exitcode
        continue-on-error: true

      - name: Stop if no changes
        if: steps.plan.outputs.exitcode == '0'
        run: echo "No changes — exiting" && exit 0

      - name: terraform apply
        if: steps.plan.outputs.exitcode == '2'
        run: terraform apply -auto-approve tfplan

      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Terraform apply ${{ job.status }} for production"
            }
```

### State backend (one-time setup, also Terraform)

You need an S3 bucket + DynamoDB table for state + locks. Set this up **before** doing anything else:

```hcl
# terraform-state-backend.tf

resource "aws_s3_bucket" "tf_state" {
  bucket = "mycompany-terraform-state-production"
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket                  = aws_s3_bucket.tf_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "tf_locks" {
  name         = "terraform-state-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"
  attribute {
    name = "LockID"
    type = "S"
  }
}
```

In your environment's `backend.tf`:

```hcl
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state-production"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-locks"
  }
}
```

See [State Management](../iac/state-management.md) for depth.

---

## Flow 3: Build and push a container to ECR

This is a sub-step of Flow 1, but it's common to want it standalone (for libraries, base images, dev tools).

### Diagram

```mermaid
flowchart LR
    A[git push main] --> B[Checkout code]
    B --> C[Assume role via OIDC]
    C --> D[ecr get-login-password]
    D --> E[docker login to ECR]
    
    E --> F[Buildx setup<br/>multi-platform support]
    F --> G[Build image<br/>using BuildKit cache from registry]
    G --> H[Tag image:<br/>:abc1234 + :latest]
    H --> I[docker push to ECR]
    
    I --> J[Trivy scan]
    J --> K{Critical<br/>vulns?}
    K -->|yes| L[❌ Fail workflow]
    K -->|no| M[✓ Image ready]
    
    M --> N[Trigger downstream:<br/>ECS deploy / app rollout]
    
    style C fill:#e1f5ff
    style J fill:#fff4e1
    style L fill:#ffe1e1
    style M fill:#e1ffe1
```

```yaml
# .github/workflows/build-and-push.yml
name: Build and Push to ECR

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-ecr-push
          aws-region: us-east-1

      - uses: aws-actions/amazon-ecr-login@v2
        id: ecr

      # Buildkit + cache from registry for faster builds
      - uses: docker/setup-buildx-action@v3

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ${{ steps.ecr.outputs.registry }}/order-service:${{ github.sha }}
            ${{ steps.ecr.outputs.registry }}/order-service:latest
          cache-from: type=registry,ref=${{ steps.ecr.outputs.registry }}/order-service:cache
          cache-to: type=registry,ref=${{ steps.ecr.outputs.registry }}/order-service:cache,mode=max

      # Scan for vulnerabilities
      - name: Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ steps.ecr.outputs.registry }}/order-service:${{ github.sha }}
          severity: CRITICAL,HIGH
          exit-code: '1'
```

---

## Combined: full deployment pipeline

The most common real-world setup combines all three flows:

### Diagram — three stages, three roles

```mermaid
graph TB
    Push[push to main] --> Build
    
    subgraph "Stage 1: Build (ECR push role)"
        Build[Build container]
        Build --> BuildAuth[OIDC → ecr-push-role]
        BuildAuth --> PushImage[Push to ECR<br/>tag: SHA]
    end
    
    PushImage --> InfraStage
    
    subgraph "Stage 2: Infra (apply role)"
        InfraStage[Detect infra changes]
        InfraStage --> InfraGate{Required reviewer<br/>for infra changes}
        InfraGate -->|approved| InfraAuth[OIDC → apply-role]
        InfraAuth --> TFApply[terraform apply<br/>variables include image_tag]
        TFApply --> InfraDone[Infra updated]
    end
    
    InfraDone --> DeployStage
    
    subgraph "Stage 3: Deploy (deploy role)"
        DeployStage[Deploy app]
        DeployStage --> DeployGate{Required reviewer<br/>for production}
        DeployGate -->|approved| DeployAuth[OIDC → deploy-role]
        DeployAuth --> ECSUpdate[ECS update-service<br/>--force-new-deployment]
        ECSUpdate --> Wait[wait services-stable]
        Wait --> Verify[Smoke tests / synthetic monitoring]
        Verify --> Done[✓ Production deployed]
    end
    
    style BuildAuth fill:#e1f5ff
    style InfraAuth fill:#fff4e1
    style DeployAuth fill:#e1ffe1
    style InfraGate fill:#ffe1e1
    style DeployGate fill:#ffe1e1
```

**Why three roles instead of one super-role**: blast radius. The build role can't apply infra. The apply role can't push containers. The deploy role can't change IAM. Each layer is independently locked down.

```yaml
# .github/workflows/full-deploy.yml
name: Full Deploy

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  # ── Stage 1: Build app image ────────────────────────────
  build:
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.build.outputs.tag }}
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123:role/github-actions-ecr-push
          aws-region: us-east-1
      - uses: aws-actions/amazon-ecr-login@v2
        id: ecr
      - name: Build & push
        id: build
        run: |
          docker build -t ${{ steps.ecr.outputs.registry }}/app:${{ github.sha }} .
          docker push ${{ steps.ecr.outputs.registry }}/app:${{ github.sha }}
          echo "tag=${{ github.sha }}" >> $GITHUB_OUTPUT

  # ── Stage 2: Apply infra changes (if any) ────────────────
  infra:
    runs-on: ubuntu-latest
    needs: build
    environment: production-infra    # Required reviewer for infra changes
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123:role/github-actions-apply-production
          aws-region: us-east-1
      - working-directory: infra/environments/production
        run: |
          terraform init
          terraform apply -auto-approve -var="image_tag=${{ needs.build.outputs.image-tag }}"

  # ── Stage 3: Deploy app via ECS ──────────────────────────
  deploy:
    runs-on: ubuntu-latest
    needs: [build, infra]
    environment: production           # Final approval
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123:role/github-actions-deploy-production
          aws-region: us-east-1
      - name: Deploy
        run: |
          aws ecs update-service \
            --cluster production \
            --service order-service \
            --force-new-deployment

      - name: Wait for service stable
        run: |
          aws ecs wait services-stable \
            --cluster production \
            --services order-service
```

Three stages, three different roles, gated by GitHub Environments for production approval.

---

## GitHub Environments — the missing protection layer

OIDC alone doesn't give you "manual approval for production." GitHub Environments do:

```
GitHub → Repo settings → Environments → New environment "production"
  
Configure:
  ✓ Required reviewers: alice, bob (the SREs)
  ✓ Wait timer: 5 minutes (cooling-off period)
  ✓ Deployment branches: main only
  ✓ Environment secrets: any prod-specific values
```

In the workflow:

```yaml
deploy:
  environment: production  # Pauses workflow until reviewer approves
```

Now any deploy to production requires a human click before running. Combined with OIDC, this gives you the right model: **automation, with humans in the loop where it matters**.

---

## Debugging — common errors

### Decision tree for "AssumeRole failed"

```mermaid
graph TD
    Error[Not authorized to perform<br/>sts:AssumeRoleWithWebIdentity]
    Error --> Q1{OIDC provider exists<br/>in this AWS account?}
    Q1 -->|no| F1[Create OIDC provider:<br/>aws_iam_openid_connect_provider]
    Q1 -->|yes| Q2{permissions: id-token: write<br/>in workflow?}
    Q2 -->|no| F2[Add permissions block<br/>to workflow]
    Q2 -->|yes| Q3{role-to-assume ARN<br/>correct?}
    Q3 -->|no| F3[Verify ARN matches<br/>created role]
    Q3 -->|yes| Q4{Trust policy 'sub'<br/>matches actual token claim?}
    Q4 -->|PR vs main mismatch| F4[Update sub pattern<br/>or use separate role]
    Q4 -->|environment claim missing| F5[Add 'environment: name'<br/>to workflow job]
    Q4 -->|wildcard not allowed in StringEquals| F6[Use StringLike<br/>instead of StringEquals]
    Q4 -->|matches| Q5{aud claim<br/>= sts.amazonaws.com?}
    Q5 -->|no| F7[Add explicit audience<br/>in trust policy]
    Q5 -->|yes| Q6{Token signature<br/>verified by AWS?}
    Q6 -->|no| F8[Recreate OIDC provider<br/>refresh thumbprints]
    
    style F1 fill:#fff4e1
    style F2 fill:#fff4e1
    style F3 fill:#fff4e1
    style F4 fill:#fff4e1
    style F5 fill:#fff4e1
    style F6 fill:#fff4e1
    style F7 fill:#fff4e1
    style F8 fill:#fff4e1
```

### `Error: Not authorized to perform sts:AssumeRoleWithWebIdentity`

The trust policy doesn't match the OIDC token. Check:

```bash
# What's the actual sub claim being sent?
# Add this step to your workflow:
- name: Debug OIDC token
  run: |
    IDTOKEN=$(curl -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
              "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com" \
              | jq -r .value)
    echo "$IDTOKEN" | cut -d'.' -f2 | base64 -d | jq
```

Compare the `sub` field to your trust policy's `StringEquals`. They must match exactly.

Common mismatches:

| Trust policy says | Token actually has | Why |
|---|---|---|
| `repo:org/repo:ref:refs/heads/main` | `repo:org/repo:pull_request` | Workflow runs on PR not push |
| `repo:org/repo:ref:refs/heads/main` | `repo:org/repo:ref:refs/heads/feature/x` | Triggered from feature branch |
| `repo:org/repo:environment:production` | `repo:org/repo:ref:refs/heads/main` | Workflow doesn't reference environment |

### `Error: Could not assume role with OIDC: No OpenIDConnect provider found`

You didn't create the OIDC provider in this AWS account. Run the `aws_iam_openid_connect_provider` Terraform.

### `Error: User: anonymous is not authorized to perform: <action>`

The role was assumed but doesn't have the permission. Add it to the role's policy.

### Workflow succeeds but `terraform apply` says "Error acquiring the state lock"

A previous apply crashed. Check DynamoDB for the lock entry; force-unlock only if you're sure no apply is running:

```bash
terraform force-unlock <LOCK_ID>
```

### "Permission denied" on `iam:PassRole`

For ECS deploys, the deploy role needs to pass roles to the ECS service. Add to deploy role:

```hcl
{
  Effect = "Allow"
  Action = "iam:PassRole"
  Resource = [
    aws_iam_role.ecs_task_execution.arn,
    aws_iam_role.ecs_task.arn,
  ]
  Condition = {
    StringEquals = {
      "iam:PassedToService" = "ecs-tasks.amazonaws.com"
    }
  }
}
```

---

## Security model — defence in depth

```mermaid
graph TD
    Attacker[Compromised PR or<br/>stolen GitHub creds]
    Attacker --> L1{Layer 1:<br/>Branch protection}
    L1 -->|blocks direct push| Stop1[✓ blocked]
    L1 -->|attacker bypasses| L2
    
    L2{Layer 2:<br/>OIDC sub claim} 
    L2 -->|only main / production env matches| L3
    L2 -->|PR / fork sub doesn't match| Stop2[✓ blocked]
    
    L3{Layer 3:<br/>Role permissions}
    L3 -->|action allowed| L4
    L3 -->|action not in policy| Stop3[✓ blocked]
    
    L4{Layer 4:<br/>GitHub Environment<br/>required reviewer}
    L4 -->|approved| L5
    L4 -->|no reviewer| Stop4[✓ blocked]
    
    L5{Layer 5:<br/>SCPs, KMS, resource policies}
    L5 -->|allowed| Damage[possible damage]
    L5 -->|blocked at AWS layer| Stop5[✓ blocked]
    
    style Stop1 fill:#e1ffe1
    style Stop2 fill:#e1ffe1
    style Stop3 fill:#e1ffe1
    style Stop4 fill:#e1ffe1
    style Stop5 fill:#e1ffe1
    style Damage fill:#ffe1e1
```

```
Layer 1: Branch protection (GitHub)
  Main branch requires PR + reviews + green CI
  Direct push to main is blocked

Layer 2: OIDC sub claim binding (AWS IAM)
  Trust policy → only specific repo + branch + environment can assume role
  No long-lived AWS keys exist in GitHub

Layer 3: Role permissions (AWS IAM)  
  Each role has minimum permissions for its job
  Plan role: read-only
  Apply role: write to specific resources
  Deploy role: ECS update + ECR push only

Layer 4: GitHub Environments
  Production deploys require human approval
  Branch restrictions: only `main` can deploy to production
  Secrets scoped to environment

Layer 5: AWS-side guardrails (SCPs, KMS keys, resource policies)
  Production resources only modifiable by the production role
  Cross-account access requires explicit trust
```

Each layer is independent. Compromising one (e.g., a malicious PR) doesn't bypass the others (GitHub Environment approval still required).

---

## Cross-account deploys (the real pattern at scale)

Most companies have separate AWS accounts per environment:

### Diagram — two-hop role assumption

```mermaid
graph LR
    subgraph "GitHub"
        WF[Workflow on main branch]
    end
    
    subgraph "Tooling Account"
        T1[OIDC Provider]
        T2[github-actions-role<br/>has sts:AssumeRole<br/>on prod-deploy-role]
    end
    
    subgraph "Production Account"
        P1[production-deploy-role<br/>trusts: tooling-account/github-actions-role]
        P2[Production resources<br/>ECS, RDS, S3, etc.]
    end
    
    WF -->|1. OIDC JWT| T1
    T1 -->|2. valid| T2
    T2 -->|3. AssumeRole<br/>via STS| P1
    P1 -->|4. temp creds| WF
    WF -->|5. deploy| P2
    
    style T2 fill:#fff4e1
    style P1 fill:#ffe1e1
```

Two hops:
1. GitHub → tooling account (via OIDC)
2. Tooling account → production account (via standard AWS AssumeRole)

Compromising the tooling account isn't enough — the attacker also needs to be able to assume the production role, which has its own trust policy.

```
Tooling account:    GitHub Actions runs here
  - github-actions-role
  - This role can sts:AssumeRole into other accounts

Production account:
  - production-deploy-role (assumable only from tooling account)
  - All production resources
```

```hcl
# In the tooling account
resource "aws_iam_role" "github_actions" {
  # Trust policy: GitHub OIDC as before
  
  # Plus: this role can assume cross-account roles
  inline_policy {
    name = "assume-cross-account"
    policy = jsonencode({
      Statement = [{
        Effect = "Allow"
        Action = "sts:AssumeRole"
        Resource = [
          "arn:aws:iam::PROD_ACCOUNT_ID:role/production-deploy-role",
          "arn:aws:iam::STAGING_ACCOUNT_ID:role/staging-deploy-role",
        ]
      }]
    })
  }
}

# In the production account
resource "aws_iam_role" "production_deploy" {
  assume_role_policy = jsonencode({
    Statement = [{
      Effect = "Allow"
      Principal = {
        AWS = "arn:aws:iam::TOOLING_ACCOUNT_ID:role/github-actions-role"
      }
      Action = "sts:AssumeRole"
    }]
  })
}
```

In the workflow:

```yaml
- name: Assume tooling-account role via OIDC
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::TOOLING_ACCOUNT:role/github-actions-role
    aws-region: us-east-1

- name: Assume production-account role
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::PROD_ACCOUNT:role/production-deploy-role
    role-chaining: true
    aws-region: us-east-1
```

Two-hop assumption. Blast radius bounded: even if tooling-account is compromised, production access requires the specific role.

---

## Cost

```
GitHub Actions:
  - Public repos: free (unlimited minutes)
  - Private repos: free tier (~2,000 min/month), then $0.008/min Linux

AWS:
  - OIDC provider: free
  - IAM roles: free
  - STS tokens: free
  - ECR storage: $0.10/GB-month
  - ECR data transfer: free within region

Typical small/mid SaaS:
  - GitHub Actions: $50-300/month
  - AWS deploy infra: nearly free (just storage)
```

OIDC is dramatically cheaper than running your own deployment infrastructure.

---

## Migration from access keys

If you currently have AWS keys in GitHub Secrets:

```
1. Create the OIDC provider + roles in AWS (Terraform above)
2. Add OIDC-based auth to a NEW workflow alongside the old
3. Test it works end-to-end
4. Switch the main workflow to OIDC
5. Delete the old IAM user + access keys
6. Audit CloudTrail: confirm no more AccessKey-based API calls
```

Don't try to flip both at once. Run them in parallel for a week, then cut over.

---

## Checklist for production-ready setup

```
✓ AWS OIDC provider created (one per account)
✓ Separate IAM roles per environment + per function (plan / apply / deploy)
✓ Trust policies use StringEquals (not StringLike with wildcards) where possible
✓ Each role has minimum permissions for its job
✓ Production roles bound to main branch + production environment only
✓ GitHub Environments configured with required reviewers for production
✓ Branch protection on main: PR required, reviews, status checks
✓ State backend (S3 + DynamoDB) for Terraform
✓ Secrets scanning enabled (gitleaks, GitHub secret scanning)
✓ Slack / email notifications for deploy success/failure
✓ Rollback procedure documented (revert commit + re-apply)
✓ CloudTrail enabled — all role assumptions auditable
```

---

## Related

- [CI/CD Fundamentals](fundamentals.md) — concepts (OIDC, pipeline anatomy)
- [Pipelines](pipelines.md) — GitHub Actions in depth
- [Terraform in CI/CD Lifecycle](../iac/terraform-cicd-lifecycle.md) — Terraform-specific deep dive
- [State Management](../iac/state-management.md) — Terraform state backend setup
- [Security in CI/CD](security-in-cicd.md) — scanning, signing, supply chain
- [Deployment Strategies](deployment-strategies.md) — canary, blue/green on ECS
- [AWS Compute Picker](../aws/picker-compute.md) — pick the right deploy target
- [Zero Trust](../security/zero-trust.md) — the security model OIDC enables
