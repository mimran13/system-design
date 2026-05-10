# IaC Best Practices

A consolidated checklist of the practices that separate IaC done well from IaC that becomes a liability. Most of these are mentioned in other pages — this is the "summary card" you'd hand to a team starting fresh.

---

## State

```
✓ Remote backend (S3 + DynamoDB, or equivalent)
✓ Encryption at rest (KMS)
✓ Versioning enabled (recovery from corruption)
✓ Bucket access locked to specific IAM roles only
✓ State locking via DynamoDB or backend-native locking
✓ Per-environment state files
✓ Per-service state within env (smaller blast radius)
✗ Never local state for shared infra
✗ Never commit .tfstate to Git
✗ Never share state across environments
```

See: [State Management](state-management.md)

---

## Repository structure

```
✓ Modules folder for reusable components
✓ Environment-per-directory (dev/, staging/, production/)
✓ Each environment has its own backend.tf
✓ Each environment has its own terraform.tfvars
✓ Each module has its own README, examples, version tags
✓ Pin module sources to tag (not main/master)
✓ Pin provider versions in required_providers
✗ No workspaces for prod-grade environment separation
✗ No nested modules deeper than 2 levels (debugging hell)
```

See: [Modules and Repository Structure](modules-and-structure.md)

---

## Code quality

```
✓ terraform fmt enforced via pre-commit hook
✓ terraform validate runs in CI
✓ tflint runs in CI (catches deprecated, unused)
✓ Variables have descriptions and types
✓ Variables have validation blocks where applicable
✓ Outputs documented with descriptions
✓ Sensitive outputs marked sensitive = true
✓ Use locals for computed values, not duplicated expressions
✗ No bare values — use variables for anything that varies
✗ No hardcoded ARNs, account IDs, region strings
```

Example:

```hcl
variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

locals {
  common_tags = {
    Environment = var.environment
    Team        = var.team
    ManagedBy   = "terraform"
    Repo        = "infra"
  }
}
```

---

## Tagging

```
✓ default_tags on the AWS provider for the basics
✓ Module-specific tags merged with default_tags
✓ Required tags: Environment, Team, ManagedBy, CostCenter (or equivalent)
✓ CostCenter tag for finance allocation
✓ Service tag for app-level grouping
✗ No untagged resources — enforce via OPA/Checkov
```

```hcl
provider "aws" {
  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "terraform"
      Repo        = "infra"
    }
  }
}

resource "aws_s3_bucket" "logs" {
  bucket = "${var.environment}-logs"
  
  tags = {
    Service     = "logging"
    DataClass   = "internal"
  }
}
```

Final tags = default + resource = both sets merged.

---

## Security

```
✓ Never commit secrets to Git (gitleaks/detect-secrets in pre-commit)
✓ Reference Secrets Manager / Vault, never embed
✓ State bucket KMS-encrypted with restricted key policy
✓ IaC role uses least privilege per environment
✓ Production role only assumable from protected workflow
✓ OIDC auth from CI to cloud (no stored credentials)
✓ Checkov/tfsec scan in CI on every PR
✓ MFA required for human break-glass access
✗ No * principals in IAM
✗ No 0.0.0.0/0 in security group rules without explicit justification
✗ No public S3 buckets without explicit annotation
```

See: [Secrets in IaC](secrets-in-iac.md)

---

## CI/CD

```
✓ All apply happens through CI, never on laptops
✓ Plan runs on every PR, posted as comment
✓ Apply requires manual approval for production
✓ Concurrency lock prevents simultaneous applies
✓ Re-plan before apply (state may have changed since PR)
✓ OIDC role for plan (read-only) and apply (write) — different roles
✓ Slack/email notification on apply success/failure
✓ Audit log of every apply (who, when, what changed)
✓ Drift detection runs daily, files an issue on drift
✗ No manual terraform apply for shared envs
✗ No skipped reviews
```

See: [Terraform in CI/CD Lifecycle](terraform-cicd-lifecycle.md)

---

## Resource lifecycle

```
✓ prevent_destroy on stateful resources (DBs, buckets with data)
✓ ignore_changes for attributes managed elsewhere (autoscaling counts)
✓ create_before_destroy where downtime is unacceptable
✓ Use moved blocks for refactoring (not raw state mv)
✓ Imports declared via import blocks (TF 1.5+) — reviewable in PR
✗ Never destroy production stateful resources without verified backup
```

Example:

```hcl
resource "aws_db_instance" "primary" {
  # ...
  
  lifecycle {
    prevent_destroy       = true
    create_before_destroy = false   # for DB, prefer migration over CBD
    ignore_changes        = [
      password,             # managed by rotation
      final_snapshot_identifier,
    ]
  }
}

resource "aws_ecs_service" "app" {
  desired_count = 3
  
  lifecycle {
    ignore_changes = [desired_count]   # autoscaling owns this
  }
}
```

---

## Module design

```
✓ Single responsibility per module
✓ Sensible defaults for inputs
✓ Output anything callers might need (ARNs, IDs, DNS, SG IDs)
✓ Tags input to allow caller-specific tagging
✓ Documented inputs/outputs (README + variable descriptions)
✓ Versioned releases (Git tags, terraform-docs README updates)
✓ Examples folder showing how to use
✗ No modules with 50+ inputs (overgrown)
✗ No hardcoded provider blocks in modules (let caller configure)
```

---

## Provider versions

```
✓ Pin Terraform version with required_version
✓ Pin provider major version with ~> in required_providers
✓ Lockfile (.terraform.lock.hcl) committed to Git
✗ No floating versions — pin everything
```

```hcl
terraform {
  required_version = "~> 1.7"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}
```

---

## Naming

```
✓ Consistent convention (e.g., ${env}-${service}-${resource})
✓ Lowercase with hyphens (some resources require this)
✓ Avoid embedded counts in names (count.index → use for_each with map keys)
✓ Use locals for computed names
✗ No spaces, no special characters, no camelCase in cloud resource names
```

---

## Cost discipline

```
✓ Infracost or equivalent in CI, posted as PR comment
✓ Cost alarms in CloudWatch / GCP Budgets
✓ CostCenter tag on every resource
✓ Reserved/Savings Plans for stable baseline (not in IaC, but track usage)
✓ Spot instances for fault-tolerant workloads
✓ Auto-shutdown for dev environments overnight
✗ No production-sized resources in dev
```

---

## Observability of IaC itself

```
✓ Apply logs preserved (CI artifacts, retained 30+ days)
✓ Slack/email notification on apply
✓ Audit trail of plan diffs (PR comments serve)
✓ Drift detection alerts go to a real channel humans read
✓ Terraform Cloud / Spacelift dashboard if using managed
```

---

## Disaster recovery

```
✓ State backups via S3 versioning
✓ State bucket replicated to a separate region (cross-region replication)
✓ Documented runbook: "what if state is corrupted/lost"
✓ Quarterly DR drill: rebuild a stack from scratch in a new account
✓ Backups for stateful resources (RDS automated backups, S3 versioning)
✗ State file backed up only to the same bucket as the original
```

---

## Anti-patterns to avoid

```
✗ Single state file for all of production (massive blast radius)
✗ Workspaces for environment separation (use directories)
✗ Hardcoded secrets, passwords, tokens
✗ Hardcoded account IDs, region strings (use data.aws_caller_identity)
✗ count and conditional resources (use for_each + map)
✗ Dynamic backend config via -backend-config in CI without strict validation
✗ Skipping plan review ("it's a small change")
✗ Force-unlocking state without verifying no apply is running
✗ Editing state files manually (use terraform state subcommands)
✗ "Just this once" manual cloud changes
```

---

## Maturity model

| Level | Characteristics |
|---|---|
| **0 — Console clicks** | No IaC; manual provisioning; tribal knowledge |
| **1 — Scripts** | Bash/Ansible scripts; not idempotent; no state |
| **2 — IaC adopted** | Terraform on laptop; local state; manual apply |
| **3 — Team IaC** | Remote state with locking; CI runs plan; engineers apply |
| **4 — Production discipline** | Apply only via CI; OIDC; per-env state; plan in PR; manual prod approval |
| **5 — Mature** | Drift detection; policy as code; cost estimation; module versioning; DR drills |
| **6 — Platform** | Self-service infra (Crossplane / Backstage); automated remediation; SLOs on infra changes |

Most teams plateau at level 3-4. Levels 5-6 require dedicated platform engineering.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you've internalised the discipline, not just the tool.

**Strong answer pattern:**
1. State is sacred — remote, locked, encrypted, backed up, scoped
2. Apply only via CI; engineers can plan but not apply against prod
3. Per-environment + per-service state — small blast radius
4. Default tags + required tags enforced via policy
5. Drift detection daily — alerts on real channels
6. Policy as code (OPA/Sentinel) for org-wide rules

**Common follow-up:** *"What's the first thing you'd add to a team that's just starting with Terraform?"*
> Remote state with locking — S3 + DynamoDB or Terraform Cloud. It's the difference between "Terraform works for one engineer" and "Terraform works for a team." Everything else (modules, environments, CI) builds on top.

---

## Related topics

- [Terraform](terraform.md) — the tool
- [State Management](state-management.md) — practices for state
- [Modules and Repository Structure](modules-and-structure.md) — code organisation
- [Terraform in CI/CD Lifecycle](terraform-cicd-lifecycle.md) — pipeline practices
- [Drift Detection](drift-detection.md) — keeping reality aligned
- [Secrets in IaC](secrets-in-iac.md) — secret-handling practices
- [Testing IaC](testing-iac.md) — test pyramid
