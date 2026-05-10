# Secrets in IaC

Secrets and IaC are uneasy partners. Your code defines infrastructure that *needs* secrets (database passwords, API keys, TLS certs), but those secrets must never end up in code, in Git, or in plaintext state. This page covers the patterns that work and the anti-patterns that leak.

---

## The core rule

> **Reference secrets. Never embed them.**

The IaC code defines *which* secret is needed. The actual secret value lives in a secrets manager. The application reads it at runtime via IAM-controlled access.

```
Bad:                              Good:
resource "aws_db_instance" {     resource "aws_db_instance" {
  password = "p@ssw0rd123"         password = data.aws_secretsmanager_secret_version
}                                              .db_password.secret_string
                                  }
```

---

## Where secrets actually live

| Location | Purpose | Used by |
|---|---|---|
| AWS Secrets Manager | App secrets, rotated automatically | Apps via IAM |
| AWS Systems Manager Parameter Store (SecureString) | Same use, simpler/cheaper | Apps via IAM |
| HashiCorp Vault | Multi-cloud, dynamic credentials | Apps via Vault auth |
| GCP Secret Manager | GCP equivalent | GCP apps |
| Azure Key Vault | Azure equivalent | Azure apps |
| Kubernetes Secrets (encrypted at rest) | K8s-native | Pods via env/file |
| SOPS-encrypted files in Git | Small-team simplicity | Apps decrypt at deploy |
| External Secrets Operator | Sync from cloud → K8s Secrets | K8s apps |

The choice depends on your stack. AWS shops use Secrets Manager + KMS. K8s-heavy shops add External Secrets Operator. Multi-cloud shops add Vault.

---

## Pattern 1: Reference an existing secret

The secret is created out-of-band (manually, by a separate process, or by a different IaC stack with stricter access).

```hcl
# Reference a secret created elsewhere
data "aws_secretsmanager_secret" "db_password" {
  name = "production/order-service/db-password"
}

data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = data.aws_secretsmanager_secret.db_password.id
}

resource "aws_db_instance" "main" {
  identifier = "order-db"
  username   = "orders_app"
  password   = data.aws_secretsmanager_secret_version.db_password.secret_string
  # ...
}
```

**Caveat**: the secret value lands in your Terraform state in plaintext. State must be encrypted at rest with strict access — see [State Management](state-management.md).

---

## Pattern 2: Generate the secret in IaC, store in secrets manager

Terraform generates a random password, stores it in Secrets Manager, then references it:

```hcl
resource "random_password" "db" {
  length  = 32
  special = true
  
  lifecycle {
    ignore_changes = [length, special]   # don't regenerate on every plan
  }
}

resource "aws_secretsmanager_secret" "db" {
  name                    = "production/order-service/db"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.secrets.id
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id     = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = "orders_app"
    password = random_password.db.result
  })
}

resource "aws_db_instance" "main" {
  identifier = "order-db"
  username   = jsondecode(aws_secretsmanager_secret_version.db.secret_string)["username"]
  password   = jsondecode(aws_secretsmanager_secret_version.db.secret_string)["password"]
}
```

The application reads the secret at runtime — never sees the Terraform state.

---

## Pattern 3: Application reads secrets at runtime (preferred)

Even better — the application reads from Secrets Manager directly. IaC only configures permissions and the secret resource itself, not the value.

```hcl
# IAM policy grants read access
data "aws_iam_policy_document" "task_secrets" {
  statement {
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [aws_secretsmanager_secret.db.arn]
  }
}

resource "aws_iam_role_policy" "task_secrets" {
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_secrets.json
}

# ECS task pulls the secret at startup (not into Terraform state)
resource "aws_ecs_task_definition" "app" {
  container_definitions = jsonencode([{
    name = "app"
    secrets = [{
      name      = "DATABASE_PASSWORD"
      valueFrom = aws_secretsmanager_secret.db.arn
    }]
  }])
}
```

Now the secret value is never in Terraform state — only the ARN is. ECS injects the value as an env var at container start, using its task role's IAM permissions.

This is the pattern to default to.

---

## Pattern 4: SOPS for small teams

Mozilla SOPS encrypts YAML/JSON files using KMS, PGP, or age:

```yaml
# secrets.yaml (encrypted in Git, decrypted at deploy)
db_password: ENC[AES256_GCM,data:abcd...,tag:efgh...]
api_key: ENC[AES256_GCM,data:wxyz...,tag:ijkl...]
sops:
  kms:
    - arn: arn:aws:kms:us-east-1:123456789:key/abc-def-...
```

```bash
# Encrypt
sops -e -i secrets.yaml

# Decrypt (requires KMS access)
sops -d secrets.yaml
```

Small team workflow:

- Commit `secrets.yaml` (encrypted) to Git
- CI decrypts at deploy time using its KMS access
- Engineers with KMS access can decrypt locally

When SOPS is good:

- Small team, all members trustworthy
- Few secrets, change rarely
- Want secrets in Git for reproducibility
- Don't want to manage Vault

When SOPS breaks:

- Many secrets, rotated frequently
- Multi-cloud or hybrid
- Need audit trail per secret read
- Need dynamic credentials

---

## Pattern 5: Vault for multi-cloud / dynamic creds

HashiCorp Vault can issue **short-lived** credentials on demand:

```bash
# App requests a DB password
vault read database/creds/orders-app
# Vault generates a new PG user, valid for 1 hour
# Returns: { username: "v-orders-abc123", password: "rand0m..." }
```

The app uses these credentials, then they expire. No long-lived passwords anywhere.

Terraform can use Vault as a provider:

```hcl
provider "vault" {
  address = "https://vault.company.com"
}

data "vault_generic_secret" "db" {
  path = "secret/data/order-service/db"
}

resource "aws_db_instance" "main" {
  password = data.vault_generic_secret.db.data["password"]
}
```

When Vault makes sense:

- Multi-cloud or hybrid (Vault is the unified secret layer)
- Need dynamic credentials (DB users, AWS STS tokens)
- Strong audit/compliance requirements
- Have the operational capacity to run Vault

---

## Anti-patterns

### Hardcoded secrets

```hcl
# NEVER
resource "aws_db_instance" "main" {
  password = "Mypassword123!"
}
```

Will end up in:
- Git history (forever, even if you delete the line later)
- State file
- Backups of state file
- CI logs (sometimes, depending on Terraform settings)

### Secrets in tfvars committed to Git

```hcl
# terraform.tfvars (committed to Git)
db_password = "Mypassword123!"
```

Same problem.

### Secrets passed as CLI args

```bash
terraform apply -var="db_password=secret"
```

Lands in shell history, process listing (`ps aux`), and CI logs.

### Plaintext state

```hcl
terraform {
  backend "s3" {
    bucket  = "tfstate"
    key     = "prod.tfstate"
    encrypt = false           # WRONG
  }
}
```

State contains secrets. Always `encrypt = true` with KMS.

### Wide-open KMS keys

```hcl
resource "aws_kms_key" "secrets" {
  policy = jsonencode({
    Statement = [{
      Effect = "Allow"
      Principal = "*"            # WRONG
      Action = "kms:*"
      Resource = "*"
    }]
  })
}
```

Anyone in your account can decrypt anything. KMS key policies should grant the **specific roles** that need access.

---

## State file is sensitive — treat it as a secret

Even with reference patterns, some secrets land in state:

- `random_password.result`
- `aws_secretsmanager_secret_version.secret_string`
- `aws_db_instance.password` (when you set it directly)
- TLS private keys generated by Terraform

Therefore:

```hcl
terraform {
  backend "s3" {
    bucket         = "tfstate-prod"
    key            = "production/order-service/terraform.tfstate"
    encrypt        = true
    kms_key_id     = "alias/terraform-state"
    dynamodb_table = "terraform-state-locks"
  }
}

resource "aws_s3_bucket" "tfstate" {
  bucket = "tfstate-prod"
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration { status = "Enabled" }
}
```

Bucket policy: only the relevant IAM roles can read/write. CloudTrail logs every access.

---

## Detection — keep secrets out of Git

Pre-commit hook to scan for secrets:

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

CI scan on every PR:

```yaml
- name: Gitleaks
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

If something does leak, treat it as a real incident:

1. Rotate the secret immediately
2. Revoke any access it granted
3. Audit logs for unauthorised use
4. Remove from Git history (BFG Repo-Cleaner) — but assume it's already been seen

---

## Mark sensitive outputs

```hcl
output "db_password" {
  value     = aws_db_instance.main.password
  sensitive = true
}
```

`sensitive = true` suppresses the value in CLI output. The value is still in state. Use this so engineers don't accidentally read passwords from `terraform output`.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you understand the secret-management discipline, not just the AWS API for it.

**Strong answer pattern:**
1. Never hardcode secrets in IaC; reference Secrets Manager / Vault / SSM
2. Application reads secrets at runtime — IaC only configures permissions
3. State contains some secrets; encrypt at rest with KMS, restrict bucket access
4. Use SOPS for small teams without Vault, with KMS-backed encryption
5. Pre-commit + CI scans (gitleaks) catch leaks before push

**Common follow-up:** *"How do you rotate a database password managed by Terraform?"*
> Use Secrets Manager rotation — Lambda function rotates on schedule, app reads via cached IAM call. Terraform manages the rotation configuration, not the password itself. For static secrets without rotation, manually update the secret in Secrets Manager and the app re-reads at next request — no Terraform apply needed because the secret value isn't in the Terraform code, only the ARN.

---

## Related topics

- [State Management](state-management.md) — state contains secrets, treat carefully
- [Best Practices](best-practices.md) — broader IaC discipline
- [Secrets Management](../security/secrets-management.md) — full secrets management deep dive
- [Encryption](../security/encryption.md) — KMS, key rotation, envelope encryption
