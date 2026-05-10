# Terraform State Management

State is the most error-prone part of Terraform. Lose it, corrupt it, or share it incorrectly and you can destroy production. This page covers the mechanics, the standard patterns, and the surgery commands you reach for when things go wrong.

---

## What state is and why it exists

Terraform state is a JSON file that maps **logical resources in your code** to **real cloud resources**.

```json
{
  "resources": [
    {
      "type": "aws_vpc",
      "name": "main",
      "instances": [{
        "attributes": {
          "id": "vpc-0a1b2c3d4e5f6789",
          "cidr_block": "10.0.0.0/16",
          "arn": "arn:aws:ec2:us-east-1:123456789:vpc/vpc-0a1b2c3d...",
          ...
        }
      }]
    }
  ]
}
```

Without state, Terraform cannot:

- Know that `resource "aws_vpc" "main"` corresponds to `vpc-0a1b2c3d`
- Compute a diff (it would have to query every resource type in every region)
- Track resources cloud APIs don't return on read (e.g., random passwords)
- Detect destroyed resources (cloud says nothing → delete from state)

---

## Local vs remote state

### Local state (the default)

```bash
$ terraform apply
$ ls
terraform.tfstate
terraform.tfstate.backup
```

Fine for tutorials. **Catastrophic for teams**:

- Two engineers run apply → race condition → state corruption
- Engineer leaves company → state file gone
- Laptop dies → state file gone
- State file accidentally committed to Git → secrets leak

### Remote state

State stored in a remote backend (S3, Azure Blob, GCS, Terraform Cloud).

```hcl
# backend.tf
terraform {
  backend "s3" {
    bucket         = "mycompany-tfstate-prod"
    key            = "production/order-service/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "alias/terraform-state-key"
    dynamodb_table = "terraform-state-locks"
  }
}
```

What this gives you:

- **Shared** — every engineer and CI job reads the same state
- **Locked** — DynamoDB prevents concurrent applies
- **Encrypted** — KMS at rest, TLS in transit
- **Versioned** — S3 versioning lets you roll back state itself
- **Audit-able** — CloudTrail logs every read/write

---

## State locking

When `terraform apply` starts, it acquires a lock. If another process holds the lock, apply waits or fails.

```
Engineer A: terraform apply
  → acquires lock (writes record to DynamoDB)
  → applying...

Engineer B: terraform apply (concurrently)
  → tries to acquire lock
  → DynamoDB write fails (item exists)
  → "Error acquiring the state lock"
  → exits without modifying anything
```

The DynamoDB table for Terraform looks like:

```hcl
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

### When locking goes wrong

If `terraform apply` is killed mid-run (CI runner crash, laptop sleep), the lock can persist.

```bash
# Check current lock holder (record in DynamoDB)
aws dynamodb get-item \
  --table-name terraform-state-locks \
  --key '{"LockID": {"S": "mycompany-tfstate-prod/production/order-service/terraform.tfstate-md5"}}'

# Force-unlock (DANGEROUS — only if you're certain no apply is running)
terraform force-unlock <LOCK_ID>
```

**Never `force-unlock` while a job might still be running.** It will corrupt state if the original apply continues writing.

---

## Backends compared

| Backend | Encrypted | Locking | Versioned | Notes |
|---|---|---|---|---|
| `local` | No | No (file lock only) | No | Default; do not use for teams |
| `s3` (with DynamoDB) | KMS | DynamoDB | Yes (S3 versioning) | Most common AWS choice |
| `s3` (with `use_lockfile = true`, TF 1.10+) | KMS | S3 native | Yes | DynamoDB no longer required |
| `azurerm` | Yes | Native | Yes | Azure Blob Storage |
| `gcs` | Yes | Native | Yes | Google Cloud Storage |
| `remote` (Terraform Cloud) | Yes | Native | Yes | Plan/apply also runs in TFC |
| `consul` | Optional | Yes | No | Self-hosted, less common now |

---

## Workspaces vs directories

Terraform offers two ways to handle multiple environments.

### Workspaces (the seductive trap)

```bash
terraform workspace new dev
terraform workspace new staging
terraform workspace new production
terraform workspace select production
terraform apply
```

State is stored under `env:/<workspace>/...` in the same backend. Same code, different state.

**Problems**:

- Same backend bucket → blast radius spans all environments
- Same provider config → same AWS account (typically)
- Easy to apply to the wrong workspace by accident
- Promotion between workspaces is awkward

### Directory-per-environment (the pattern that scales)

```
infra/
├── modules/
│   └── ecs-service/
└── environments/
    ├── dev/
    │   ├── main.tf          # uses modules/ecs-service
    │   ├── backend.tf       # bucket: tfstate-dev
    │   └── terraform.tfvars
    ├── staging/
    │   ├── main.tf
    │   ├── backend.tf       # bucket: tfstate-staging
    │   └── terraform.tfvars
    └── production/
        ├── main.tf
        ├── backend.tf       # bucket: tfstate-prod (separate AWS account)
        └── terraform.tfvars
```

**Why directories win**:

- Different backends per env → different IAM, different KMS keys, different accounts
- Different provider configs → can target different accounts/regions
- `cd` makes the active environment explicit
- Promotion = PR that bumps a version variable

Use workspaces only for trivial parallel duplicates (e.g., per-region within the same env).

---

## State splitting (per-service state files)

One state file for an entire environment is fine for small projects. At scale, split per-service:

```
environments/production/
├── networking/         # VPC, subnets, NAT, Route53 — changes rarely
│   ├── main.tf
│   └── backend.tf      # key: production/networking/terraform.tfstate
├── databases/          # RDS, ElastiCache — changes occasionally
│   └── backend.tf      # key: production/databases/terraform.tfstate
├── order-service/      # ECS service, ALB target group
│   └── backend.tf      # key: production/order-service/terraform.tfstate
└── payment-service/
    └── backend.tf      # key: production/payment-service/terraform.tfstate
```

Cross-state references via `terraform_remote_state` data source:

```hcl
# In order-service/main.tf
data "terraform_remote_state" "networking" {
  backend = "s3"
  config = {
    bucket = "mycompany-tfstate-prod"
    key    = "production/networking/terraform.tfstate"
    region = "us-east-1"
  }
}

resource "aws_ecs_service" "order" {
  network_configuration {
    subnets = data.terraform_remote_state.networking.outputs.private_subnet_ids
  }
}
```

**Trade-off**: more state files = smaller blast radius, but more orchestration when changes span multiple services.

---

## State surgery — the commands you'll occasionally need

Treat these like database surgery: back up first, double-check, ideally pair with another engineer.

### `terraform state list`
Show every resource currently in state.

```bash
terraform state list
# aws_vpc.main
# aws_subnet.private[0]
# aws_subnet.private[1]
# module.ecs.aws_ecs_cluster.main
```

### `terraform state show <addr>`
Print full attributes for a resource.

```bash
terraform state show aws_vpc.main
```

### `terraform state mv` — rename without destroying

The most common surgery. You renamed a resource block in code; without `state mv`, Terraform plans destroy + recreate.

```bash
# Renamed `aws_vpc.main` → `aws_vpc.primary` in code
terraform state mv aws_vpc.main aws_vpc.primary

# Or moving into a module
terraform state mv aws_vpc.main module.networking.aws_vpc.primary

# Or moving between state files
terraform state mv -state-out=../networking/terraform.tfstate \
  aws_vpc.main aws_vpc.main
```

### `terraform state rm` — forget without destroying

Tell Terraform to stop tracking a resource. The cloud resource keeps existing.

```bash
terraform state rm aws_s3_bucket.legacy_logs
# Bucket still exists; Terraform no longer manages it
```

Used when migrating ownership: e.g., another team / state file will adopt this resource.

### `terraform import` — adopt an existing resource into state

You created a resource manually in the console; you want Terraform to manage it going forward.

```bash
# Write the resource block in code first
resource "aws_s3_bucket" "logs" {
  bucket = "company-logs-prod"
}

# Then import the existing bucket
terraform import aws_s3_bucket.logs company-logs-prod

# Plan should now show no changes
terraform plan
```

For Terraform 1.5+, you can declare imports in HCL:

```hcl
import {
  to = aws_s3_bucket.logs
  id = "company-logs-prod"
}
```

This is reviewable in PRs (unlike CLI imports), and runs as part of normal apply.

### `terraform refresh`

Update state from real cloud resources without making changes. Mostly deprecated; use `terraform plan -refresh-only`.

---

## State file recovery

### S3 versioning saves you

Always enable versioning on the state bucket.

```hcl
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}
```

To restore a previous version:

```bash
# List versions
aws s3api list-object-versions \
  --bucket mycompany-tfstate-prod \
  --prefix production/order-service/terraform.tfstate

# Copy old version to current
aws s3api copy-object \
  --bucket mycompany-tfstate-prod \
  --copy-source mycompany-tfstate-prod/production/order-service/terraform.tfstate?versionId=abc123 \
  --key production/order-service/terraform.tfstate
```

### `terraform state pull` / `push`

Download state, edit (carefully), upload.

```bash
terraform state pull > current.tfstate
# edit current.tfstate (DANGEROUS)
terraform state push current.tfstate
```

Used in catastrophic scenarios. Always back up first.

---

## Sensitive data in state

State contains **actual values**, including secrets. Examples:

- `aws_db_instance.password` — yes, in plaintext in state
- `aws_secretsmanager_secret_version.secret_string` — same
- TLS private keys generated by Terraform

**Implications**:

- State bucket must be encrypted (KMS) and access-restricted
- State bucket access = secret access (treat it as such)
- Mark sensitive outputs to suppress display:

```hcl
output "db_password" {
  value     = aws_db_instance.main.password
  sensitive = true
}
```

`sensitive = true` only suppresses CLI output. The value is still in state.

---

## Best practices summary

```
1. Remote state with locking, always.
   S3 + DynamoDB (or S3 native locking on TF 1.10+) for AWS.

2. Encrypt at rest with KMS.
   Separate KMS keys per environment.

3. Versioning on the state bucket.
   Recovery from accidental corruption.

4. Per-environment + per-service state.
   Smaller blast radius, parallel applies across services.

5. Lock down state bucket IAM.
   Only the apply role for that env+service can write.

6. Never commit state to Git.
   Add *.tfstate, *.tfstate.* to .gitignore.

7. Treat state surgery as last resort.
   Always back up first; review with another engineer.

8. Use `import` blocks (TF 1.5+) instead of CLI imports.
   Reviewable in PRs.

9. Never `force-unlock` casually.
   Investigate why the lock exists first.
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you treat state with the seriousness it deserves. State management is where Terraform deployments actually fail in production.

**Strong answer pattern:**
1. State maps logical to physical resources; required for diffs and idempotency
2. Remote, encrypted, locked, versioned — non-negotiable for any team
3. Per-environment directories with separate backends — not workspaces
4. State surgery (`state mv`, `import`) is occasionally needed; back up first
5. State contains secrets; treat the bucket like a vault

**Common follow-up:** *"What happens if you lose the state file?"*
> Without state, Terraform thinks nothing exists. Next apply tries to create everything — usually fails on name collisions, sometimes destructively duplicates. Recovery options: restore from S3 versioning, restore from backup, or `terraform import` every resource manually (slow, painful). This is why versioning + backups + IAM restrictions are mandatory.

---

## Related topics

- [Terraform](terraform.md) — the tool
- [Terraform in CI/CD Lifecycle](terraform-cicd-lifecycle.md) — how state fits the pipeline
- [Drift Detection](drift-detection.md) — when state diverges from cloud reality
- [Modules & Repository Structure](modules-and-structure.md) — how to split state cleanly
- [Secrets in IaC](secrets-in-iac.md) — what to never put in state
