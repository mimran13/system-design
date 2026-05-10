# Drift Detection

Drift is the gap between what your IaC code says infrastructure should be and what it actually is. Drift is inevitable — manual fixes during incidents, console clicks, automated policies, even cloud provider auto-updates — and undetected drift turns "we manage this with Terraform" into a polite fiction.

---

## What drift is

```
Terraform state says:               Real cloud says:
  RDS instance size: db.t3.medium    RDS instance size: db.t3.large
  Security group: 80, 443 open       Security group: 80, 443, 22 open ← drift
  ECS desired count: 5               ECS desired count: 8 ← drift
```

The IaC code is supposed to be the **source of truth**. When reality diverges, every assumption breaks:

- Engineers can't trust the code reflects production
- Apply could revert critical hotfixes ("why is the DB suddenly smaller?")
- Audits show non-conformance with policy
- New environments don't match production behaviour

---

## How drift happens

### Manual interventions

```
Pager goes off at 02:00.
On-call engineer SSHes into the bastion.
Bumps the RDS instance class via console to absorb traffic.
Doesn't update Terraform code — incident is the priority.
Drift created.
```

The most common source. Often legitimate; needs to be codified afterwards.

### Other tools touching the same resources

```
Terraform manages the ECS service.
Auto-scaling adjusts desired_count up to 20.
Terraform code still says desired_count = 3.
Next apply: scales back down to 3.
```

The fix here is `lifecycle { ignore_changes = [desired_count] }` — explicitly tell Terraform to ignore that attribute.

### Cloud provider auto-updates

```
AWS rolls out a new "default" attribute on a resource type.
Existing resources auto-set the new attribute.
Your Terraform code doesn't mention it → drift detected.
```

Typically benign — update the code or ignore the attribute.

### Compromised credentials

```
Attacker obtains AWS credentials.
Modifies a security group to add their IP.
Drift detection catches it before the next apply masks it.
```

Drift detection doubles as a security control.

---

## Detecting drift in Terraform

### `terraform plan` is drift detection

```bash
$ terraform plan
# ...
Terraform will perform the following actions:

  # aws_security_group.web will be updated in-place
  ~ resource "aws_security_group" "web" {
      ~ ingress = [
          - {
              - cidr_blocks = ["0.0.0.0/0"]
              - from_port   = 22
              - to_port     = 22
              - protocol    = "tcp"
            },
            {
              cidr_blocks = ["0.0.0.0/0"]
              from_port   = 443
              to_port     = 443
              protocol    = "tcp"
            },
        ]
    }

Plan: 0 to add, 1 to change, 0 to destroy.
```

Any change in the plan output that you didn't introduce in code = drift.

### `-detailed-exitcode`

```bash
terraform plan -detailed-exitcode

# Exit codes:
# 0 = no changes (no drift)
# 1 = error
# 2 = changes detected (drift)
```

Used in scripts and CI for clean automation.

### Refresh-only mode

```bash
terraform plan -refresh-only
```

Updates state from real cloud values without computing diffs against code. Useful for understanding what changed externally.

---

## Scheduled drift detection in CI

Run a daily plan against every environment:

```yaml
# .github/workflows/terraform-drift.yml
name: Terraform Drift Detection

on:
  schedule:
    - cron: '0 6 * * *'   # daily 06:00 UTC
  workflow_dispatch:

permissions:
  id-token: write
  contents: read
  issues: write           # to file an issue on drift

jobs:
  drift:
    strategy:
      matrix:
        environment: [dev, staging, production]
      fail-fast: false
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/terraform-plan-${{ matrix.environment }}
          aws-region: us-east-1
      
      - name: Plan
        id: plan
        working-directory: infra/environments/${{ matrix.environment }}
        run: |
          terraform init
          terraform plan -detailed-exitcode -no-color -var-file=terraform.tfvars > plan.txt 2>&1
        continue-on-error: true
      
      - name: Upload plan
        if: steps.plan.outputs.exitcode == '2'
        uses: actions/upload-artifact@v4
        with:
          name: drift-${{ matrix.environment }}-${{ github.run_id }}
          path: infra/environments/${{ matrix.environment }}/plan.txt
      
      - name: File issue on drift
        if: steps.plan.outputs.exitcode == '2'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const plan = fs.readFileSync('infra/environments/${{ matrix.environment }}/plan.txt', 'utf8');
            const truncated = plan.length > 60000 ? plan.slice(0, 60000) : plan;
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Drift detected: ${{ matrix.environment }}`,
              body: `Drift detected in ${{ matrix.environment }} on ${new Date().toISOString()}\n\n\`\`\`hcl\n${truncated}\n\`\`\``,
              labels: ['drift', '${{ matrix.environment }}'],
            });
      
      - name: Notify Slack
        if: steps.plan.outputs.exitcode == '2'
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Terraform drift detected in ${{ matrix.environment }}\nSee: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
            }
```

Run frequency depends on your environment:

- **Production**: daily, sometimes hourly
- **Staging**: daily
- **Dev**: weekly or on-demand

---

## CloudFormation drift detection

Built into the CloudFormation service:

```bash
# Trigger drift detection
aws cloudformation detect-stack-drift --stack-name order-service-prod

# Get results (after detection completes)
aws cloudformation describe-stack-resource-drifts \
  --stack-name order-service-prod \
  --stack-resource-drift-status-filters MODIFIED DELETED

# Output:
# - LogicalResourceId: SecurityGroup
#   StackResourceDriftStatus: MODIFIED
#   PropertyDifferences:
#     - PropertyPath: /SecurityGroupIngress/2/CidrIp
#       ExpectedValue: "10.0.0.0/8"
#       ActualValue: "0.0.0.0/0"
#       DifferenceType: NOT_EQUAL
```

CloudFormation drift detection is **read-only** — it tells you what's drifted, doesn't fix it. Schedule via EventBridge for the same daily-check pattern.

---

## Pulumi drift detection

```bash
pulumi refresh    # update state from cloud (drift detection)
pulumi preview    # show what would change to align cloud with code
```

Run in CI on schedule, alert if `preview` shows changes after refresh.

---

## Resolving drift

When drift is detected, you have three options.

### Option 1: Re-apply (revert the manual change)

If the manual change was unauthorised or incorrect:

```bash
terraform apply
# Restores resources to match code
```

Done. The drift was noise; code is the truth.

### Option 2: Codify the change

If the manual change was a legitimate hotfix that should stick:

```hcl
# Update Terraform code to reflect the new state
resource "aws_db_instance" "primary" {
  instance_class = "db.r6g.2xlarge"   # was db.r6g.xlarge before incident
}
```

Open a PR documenting the decision. Apply the (now no-op) plan to clear the drift.

### Option 3: Investigate

If neither of the above:

- Was this from another tool you forgot about?
- Was it a cloud provider change?
- Was it malicious?

Find the root cause before resolving. CloudTrail (AWS) shows who made the change.

---

## Preventing drift

### Lock down console access

The single most effective measure. If engineers cannot click in the console, they cannot drift.

```
Production AWS account:
  Engineer IAM users: read-only access
  Terraform CI role: full access (only assumable from CI)
  Break-glass role: full access, audited (use only in emergencies)
```

### Use `lifecycle { ignore_changes }` for autoscaling

```hcl
resource "aws_ecs_service" "app" {
  desired_count = 3   # initial value only
  
  lifecycle {
    ignore_changes = [desired_count]   # autoscaling owns this
  }
}
```

Without this, Terraform fights autoscaling daily.

### `prevent_destroy` on stateful resources

```hcl
resource "aws_db_instance" "primary" {
  lifecycle {
    prevent_destroy = true
  }
}
```

Doesn't prevent drift, but prevents catastrophic apply (accidental destroy).

### Use Service Control Policies (AWS Organisations)

Block specific actions at the org level:

```json
{
  "Effect": "Deny",
  "Action": ["ec2:ModifyInstance*", "rds:ModifyDBInstance"],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {
      "aws:PrincipalArn": "arn:aws:iam::*:role/terraform-apply-*"
    }
  }
}
```

Only the Terraform role can modify these resources. Console clicks fail.

### Audit logs

CloudTrail (AWS), GCP audit logs, Azure Activity Log — capture every API call. Combined with drift detection, you know exactly who drifted what when.

---

## Drift detection products

| Product | What it adds |
|---|---|
| **Terraform Cloud / HCP Terraform** | Built-in drift detection, dashboard, notifications |
| **Spacelift** | Drift detection across Terraform, Pulumi, CloudFormation |
| **env0** | Drift detection + scheduled remediation |
| **driftctl** | Open-source; finds resources NOT in Terraform state (the inverse problem) |
| **Snyk IaC + cloud scanning** | Combines IaC scanning with cloud reality checks |

`driftctl` solves a different problem — finding cloud resources that aren't managed by Terraform at all. Useful when adopting IaC into an existing environment.

```bash
driftctl scan --from tfstate+s3://my-bucket/terraform.tfstate

# Output:
# Found 245 resource(s) managed by Terraform
# Found 17 resource(s) NOT managed by Terraform:
#   - aws_security_group: sg-orphan123
#   - aws_iam_role: legacy-deploy-role
#   - ...
```

---

## When drift detection lies

False positives are common. Investigate before reacting:

| Plan shows... | Likely cause |
|---|---|
| Tags changing on every plan | Provider auto-injecting region/account tags; add to `default_tags` or ignore |
| `replace` on a resource that "looks the same" | Identifier attribute changed (e.g., `name` for IAM role); not real drift |
| Massive diff after provider upgrade | Provider added new attributes with computed defaults; usually benign |
| Drift only on `ami_id` | New AMI released; expected for `data "aws_ami" { most_recent = true }` |

A team that cries wolf with drift alerts will eventually ignore real ones. Tune to keep signal-to-noise high.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you've operated IaC at scale long enough to know drift is real and unavoidable.

**Strong answer pattern:**
1. Drift is the gap between IaC and reality; mostly from manual changes during incidents
2. Detect with scheduled `terraform plan` (or `cdk diff` / `pulumi preview`)
3. Three resolutions: re-apply (revert), codify (accept), investigate (unknown)
4. Prevent by locking console access, using SCPs, `ignore_changes` for autoscaling
5. Tune the noise — false positives erode trust in alerts

**Common follow-up:** *"What if your scheduled drift job alerts every day for the same drift?"*
> Means we're not resolving it. Either the manual change should be codified (PR), or someone keeps making the same manual change (process problem). The alert should escalate, not become wallpaper. Often this is `ignore_changes` worth adding because the drift comes from a legitimate other system.

---

## Related topics

- [State Management](state-management.md) — drift is detected via state vs cloud comparison
- [Terraform in CI/CD Lifecycle](terraform-cicd-lifecycle.md) — drift detection is part of the lifecycle
- [Best Practices](best-practices.md) — preventing drift is part of mature IaC
- [Secrets Management](../security/secrets-management.md) — drift on secret resources is a security concern
