# Modules and Repository Structure

Module design and repo layout determine whether your IaC scales to dozens of engineers or collapses under its own weight. Bad structure forces small changes to touch the whole codebase; good structure makes each change small, reviewable, and isolated.

---

## What a module is

A module is a reusable bundle of Terraform resources with inputs (variables) and outputs.

```hcl
# modules/ecs-service/variables.tf
variable "name"            { type = string }
variable "image"           { type = string }
variable "cpu"             { type = number }
variable "memory"          { type = number }
variable "min_tasks"       { type = number }
variable "max_tasks"       { type = number }
variable "vpc_id"          { type = string }
variable "subnet_ids"      { type = list(string) }
variable "environment"     { type = string }
variable "container_port"  { type = number, default = 8080 }

# modules/ecs-service/main.tf
resource "aws_ecs_cluster" "this" { ... }
resource "aws_ecs_task_definition" "this" { ... }
resource "aws_ecs_service" "this" { ... }
resource "aws_appautoscaling_target" "this" { ... }

# modules/ecs-service/outputs.tf
output "cluster_arn"     { value = aws_ecs_cluster.this.arn }
output "service_name"    { value = aws_ecs_service.this.name }
output "task_role_arn"   { value = aws_iam_role.task.arn }
```

Calling the module:

```hcl
module "order_service" {
  source = "../../modules/ecs-service"
  
  name           = "order-service"
  image          = "${aws_ecr_repository.order.repository_url}:${var.image_tag}"
  cpu            = 512
  memory         = 1024
  min_tasks      = 3
  max_tasks      = 30
  vpc_id         = module.networking.vpc_id
  subnet_ids     = module.networking.private_subnet_ids
  environment    = var.environment
}
```

---

## What makes a good module

**1. Single responsibility.** A module should provision one logical thing. `ecs-service`, not `ecs-service-and-rds-and-route53`.

**2. Sensible defaults, override when needed.**

```hcl
variable "log_retention_days" {
  type    = number
  default = 30   # most services want 30 days
}
```

**3. Outputs cover composition needs.** Anything callers need to reference must be an output. ARNs, IDs, DNS names.

**4. Tag inputs.**

```hcl
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_ecs_cluster" "this" {
  tags = merge(var.tags, {
    Name = var.name
  })
}
```

**5. Versioned.** Modules in a registry or Git tag — never reference `main`.

```hcl
module "order_service" {
  source  = "git::https://github.com/myorg/terraform-modules.git//ecs-service?ref=v2.3.1"
  # ...
}

# Or Terraform Registry:
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
}
```

---

## What makes a bad module

**1. Too generic.** A module that takes 80 inputs to handle every edge case is just Terraform-with-extra-steps.

**2. Hidden side effects.** Module creates a Route53 record using a hardcoded zone — caller doesn't see it.

**3. Mixing concerns.** Module that provisions ECS service AND its CI/CD pipeline AND a CloudFront distribution.

**4. Hardcoded environment assumptions.**

```hcl
# BAD
provider "aws" {
  region = "us-east-1"
}

# GOOD: provider passed by caller
```

**5. Pinning to `latest` or `main`.** Module updates silently break dependents.

---

## Module composition patterns

### Foundation modules

Provision low-level infra: VPC, subnets, IAM, KMS keys.

```hcl
module "networking" {
  source = "../../modules/networking"
  cidr   = "10.0.0.0/16"
  azs    = ["us-east-1a", "us-east-1b", "us-east-1c"]
}
```

### Service modules

Compose foundation outputs into a deployable service.

```hcl
module "order_service" {
  source = "../../modules/ecs-service"
  vpc_id     = module.networking.vpc_id
  subnet_ids = module.networking.private_subnet_ids
}
```

### Composition modules ("stacks")

Bundle several service modules for a deployable unit.

```hcl
# modules/payment-platform/main.tf
module "order_service"   { source = "../ecs-service" ... }
module "payment_service" { source = "../ecs-service" ... }
module "payment_db"      { source = "../rds" ... }
module "payment_queue"   { source = "../sqs" ... }
```

Use sparingly — composition modules become god-objects.

---

## Repository structure patterns

### Pattern 1: Monorepo with environments and modules

```
infra/
├── modules/                       # reusable modules
│   ├── vpc/
│   ├── ecs-service/
│   ├── rds-postgres/
│   ├── sqs-queue/
│   └── alb/
│
├── environments/
│   ├── dev/
│   │   ├── networking/
│   │   │   ├── main.tf
│   │   │   ├── backend.tf         # key: dev/networking/tfstate
│   │   │   └── outputs.tf
│   │   ├── databases/
│   │   ├── order-service/
│   │   │   ├── main.tf            # uses module ecs-service
│   │   │   ├── backend.tf         # key: dev/order-service/tfstate
│   │   │   └── terraform.tfvars
│   │   └── payment-service/
│   ├── staging/
│   └── production/
│
├── global/                        # shared across envs
│   ├── ecr/                       # repos used by all envs
│   ├── iam-roles/                 # CI roles
│   └── route53-zones/
│
└── .github/workflows/
    ├── terraform-plan.yml
    └── terraform-apply.yml
```

**Pros**:
- Single source of truth
- Atomic PRs touching modules + environments
- Easy refactoring across modules

**Cons**:
- Coarse permissions (everyone can see all envs)
- Large repo, slower CI without path filters
- Harder for separate teams to own slices

### Pattern 2: Polyrepo

```
terraform-modules/                 # one repo per module collection
├── ecs-service/
├── rds/
└── vpc/

infra-production/                  # one repo per env
infra-staging/
infra-dev/

infra-payment-team/                # or one repo per team
infra-order-team/
```

**Pros**:
- Fine-grained access control per repo
- Smaller blast radius
- Independent CI

**Cons**:
- Cross-cutting changes touch many repos
- Module versioning overhead
- Hard to refactor

### Pattern 3: Hybrid (most common at scale)

- One repo for shared modules (versioned releases)
- One repo per environment OR per team-environment combo
- CI roles defined globally

---

## Environments — dev, staging, production

The same code, different variable values:

```hcl
# environments/dev/order-service/terraform.tfvars
environment       = "dev"
min_tasks         = 1
max_tasks         = 3
db_instance_class = "db.t3.small"
log_retention     = 7

# environments/production/order-service/terraform.tfvars
environment       = "production"
min_tasks         = 3
max_tasks         = 50
db_instance_class = "db.r6g.xlarge"
log_retention     = 90
```

Same module, different inputs. Drift between environments comes from per-env hacks — avoid them.

### Promoting changes through environments

A change goes through:

```
PR opened
  ↓
Reviewer + CI plan for dev (auto)
  ↓
Merge → apply to dev
  ↓
Smoke tests pass in dev
  ↓
Merge to staging branch (or PR to staging dir) → apply to staging
  ↓
Manual gate (after 24h soak, or QA approval)
  ↓
Merge to production → apply to production
```

This is why each environment having its own directory matters: promotion = PR.

---

## Variables, locals, and tfvars

### Variables — module/configuration inputs

```hcl
variable "environment" {
  description = "Environment name"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}
```

### Locals — internal computed values

```hcl
locals {
  common_tags = {
    Environment = var.environment
    Team        = var.team
    ManagedBy   = "terraform"
    Repo        = "infra"
  }
  
  service_name = "${var.environment}-${var.name}"
}
```

### tfvars — environment-specific values

```hcl
# environments/production/order-service/terraform.tfvars
environment       = "production"
team              = "orders"
min_tasks         = 3
max_tasks         = 50
```

Loaded automatically if named `terraform.tfvars` or `*.auto.tfvars`. Otherwise pass with `-var-file=`.

---

## Provider configuration

### Per-environment provider

```hcl
# environments/production/order-service/providers.tf
provider "aws" {
  region = "us-east-1"
  
  assume_role {
    role_arn = "arn:aws:iam::PROD_ACCOUNT_ID:role/terraform-apply"
  }
  
  default_tags {
    tags = {
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}
```

`default_tags` automatically tags every taggable resource — saves hundreds of lines of boilerplate.

### Multiple providers / accounts

```hcl
provider "aws" {
  alias  = "shared"
  region = "us-east-1"
  assume_role {
    role_arn = "arn:aws:iam::SHARED_ACCOUNT_ID:role/terraform"
  }
}

resource "aws_route53_zone" "main" {
  provider = aws.shared
  name     = "company.com"
}
```

Used for cross-account scenarios — DNS in shared account, services in env accounts.

---

## Naming conventions

```
Resource type      Naming                                Example
─────────────────  ─────────────────────────────────────  ───────────────────────────
VPC                ${env}-${region}-vpc                   prod-us-east-1-vpc
Subnet             ${env}-${region}-${tier}-${az}         prod-us-east-1-private-1a
Security group     ${env}-${service}-sg                   prod-order-service-sg
ECS cluster        ${env}-${platform}                     prod-orders
ECS service        ${env}-${service}                      prod-order-service
RDS instance       ${env}-${service}-db                   prod-order-service-db
S3 bucket          ${account}-${env}-${purpose}           123456789-prod-logs
IAM role           ${env}-${service}-${purpose}-role      prod-order-service-task-role
```

Consistency matters more than the specific scheme. Pick one and enforce.

---

## Tagging strategy

Every resource should have a baseline of tags:

```hcl
locals {
  common_tags = {
    Environment = var.environment       # dev/staging/production
    Team        = var.team              # owns this resource
    Service     = var.service           # which app
    Repo        = "infra"               # which repo manages it
    ManagedBy   = "terraform"           # vs CloudFormation, manual, etc.
    CostCenter  = var.cost_center       # finance allocation
  }
}
```

Why tags matter:

- **Cost allocation** — AWS Cost Explorer breaks down by tag
- **Security audits** — find untagged resources (suspicious)
- **Operational queries** — "all resources for the orders team in prod"
- **Automation** — backup policies based on `BackupPolicy` tag

Use `default_tags` in the AWS provider to apply common tags automatically.

---

## Refactoring modules safely

Renaming a resource block means Terraform plans destroy + create. Two strategies:

### `moved` blocks (Terraform 1.1+)

```hcl
moved {
  from = aws_instance.web
  to   = aws_instance.app
}

resource "aws_instance" "app" { ... }
```

Terraform sees the `moved` block, updates state, no destroy.

### `terraform state mv`

CLI equivalent — reviewable only via the resulting plan, so prefer `moved` blocks.

---

## Best practices checklist

```
✓ Modules: single-purpose, versioned, well-documented inputs/outputs
✓ Environments: directory per env, separate state per env
✓ Per-service state within env: smaller blast radius
✓ Naming: convention enforced via lint or pre-commit hook
✓ Tags: default_tags + common_tags pattern, every resource tagged
✓ Provider versions: pinned with ~> in required_providers
✓ Module sources: pinned to tag, never main/master
✓ Variables: validated where possible (allowed values, regex)
✓ Sensitive outputs: marked sensitive = true
✓ Lifecycle blocks: prevent_destroy on stateful resources
✓ Refactoring: use moved blocks, not state mv
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you've actually structured a real codebase, not just written tutorials.

**Strong answer pattern:**
1. Modules are single-purpose, versioned, with clear inputs/outputs
2. Environments are directories with separate state — never workspaces for prod-grade work
3. State is split per service within env to limit blast radius
4. Tagging is automatic via `default_tags`; modules add resource-specific tags
5. Refactoring uses `moved` blocks; never blindly rename

**Common follow-up:** *"How do you share infrastructure between teams?"*
> Foundation modules (VPC, IAM) live in a shared state owned by platform. Service modules consume foundation outputs via `terraform_remote_state`. Each team owns the state for their services. CI roles enforce who can apply what.

---

## Related topics

- [Terraform](terraform.md) — modules and resources basics
- [State Management](state-management.md) — backend per environment
- [Terraform in CI/CD Lifecycle](terraform-cicd-lifecycle.md) — promotion through environments
- [Best Practices](best-practices.md) — broader IaC discipline
