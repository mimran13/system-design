# Testing IaC

IaC code can break production as fast as application code — sometimes faster. Testing it is non-negotiable, but the techniques differ from app testing: you're checking for syntax, security, policy compliance, and post-deploy behaviour, not just unit logic.

---

## The testing pyramid for IaC

```
              ┌──────────────────────┐
              │   E2E (Terratest)    │  slow, expensive
              ├──────────────────────┤
              │  Policy as Code      │  OPA, Sentinel, Checkov
              │  (Conftest, Checkov) │
              ├──────────────────────┤
              │  Static analysis     │  fast
              │  (tflint, tfsec)     │
              ├──────────────────────┤
              │  Validation          │  cheapest
              │  (terraform validate)│
              └──────────────────────┘
```

Run the cheap tests first, fail fast, only run expensive ones when the cheap ones pass.

---

## Layer 1: Validation

The minimum bar — does the code parse and reference real provider attributes?

### `terraform fmt -check`

Enforces canonical formatting. Fails CI if files aren't formatted.

```bash
terraform fmt -check -recursive
```

### `terraform validate`

Checks syntax and provider schema. Catches typos in attribute names, missing required fields, type mismatches.

```bash
terraform init -backend=false
terraform validate
```

`-backend=false` skips backend initialisation (faster in CI).

---

## Layer 2: Linting

### tflint

Catches issues `terraform validate` misses: deprecated providers, unused variables, AWS-specific gotchas.

```bash
tflint --init
tflint --recursive
```

```hcl
# .tflint.hcl
plugin "aws" {
  enabled = true
  version = "0.30.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}

rule "terraform_naming_convention" {
  enabled = true
}

rule "terraform_unused_declarations" {
  enabled = true
}
```

Catches things like:

```
ERROR: aws_instance.web has invalid instance_type "t2.huge"
WARNING: variable "unused_var" is declared but not used
```

### Provider-specific linters

- **tflint-ruleset-aws** — AWS-specific rules
- **tflint-ruleset-google** — GCP
- **tflint-ruleset-azurerm** — Azure

---

## Layer 3: Security scanning

The most valuable layer for production. Catches misconfigurations that lead to breaches.

### Checkov

Multi-cloud, multi-tool security scanner. Hundreds of built-in policies:

```bash
checkov -d infra/ --framework terraform
```

Catches:

```
CKV_AWS_19: "Ensure all data stored in the S3 bucket is securely encrypted at rest"
  FAILED for resource: aws_s3_bucket.logs
  
CKV_AWS_24: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 22"
  FAILED for resource: aws_security_group.web
  
CKV_AWS_109: "Ensure IAM policies does not allow data exfiltration"
  FAILED for resource: aws_iam_policy.app_policy
```

### tfsec

Faster, focused on security. Fewer false positives than Checkov, narrower scope.

```bash
tfsec infra/
```

### Trivy (now also scans IaC)

Aqua's tool — originally for container images, now also scans Terraform/CloudFormation.

```bash
trivy config infra/
```

### Pick one or stack them

Most teams run **Checkov as the primary** with **tfsec as a secondary**. Both fast, both run on every PR. Stacking catches more issues but creates more noise — tune the rule set.

```yaml
# CI step
- uses: bridgecrewio/checkov-action@master
  with:
    directory: infra/
    framework: terraform
    soft_fail: false
    skip_check: CKV_AWS_5,CKV_AWS_24   # explicit suppressions
```

---

## Layer 4: Policy as Code

Beyond security, enforce custom policies: tagging requirements, allowed regions, instance type whitelist, cost guards.

### Open Policy Agent (OPA) + Conftest

Vendor-neutral policy engine. Write policies in Rego, evaluate against any structured input (Terraform plan JSON, K8s manifests, etc.).

```rego
# policy/terraform.rego
package terraform

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_instance"
  not resource.change.after.tags.Environment
  msg := sprintf("aws_instance %s missing required tag: Environment", [resource.address])
}

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_db_instance"
  not resource.change.after.storage_encrypted
  msg := sprintf("aws_db_instance %s must have storage_encrypted = true", [resource.address])
}
```

```bash
terraform plan -out=tfplan
terraform show -json tfplan > plan.json
conftest test --policy policy/ plan.json
```

OPA scales from one repo to entire orgs (with `Gatekeeper` for K8s, `OPA-Envoy` for service mesh).

### HashiCorp Sentinel (Terraform Cloud only)

Similar to OPA but commercial, integrated with Terraform Cloud:

```python
# sentinel/require-tags.sentinel
import "tfplan/v2" as tfplan

required_tags = ["Environment", "Team", "ManagedBy"]

main = rule {
    all tfplan.resource_changes as _, rc {
        rc.mode is "managed" and
        rc.type matches "aws_(instance|db_instance|s3_bucket)" implies
        all required_tags as tag {
            rc.change.after.tags[tag] is not null
        }
    }
}
```

Use Sentinel if you're on Terraform Cloud; OPA otherwise.

---

## Layer 5: Plan-based tests

Test that **the plan does what you expect** before applying.

### `terraform-compliance`

BDD-style tests against `terraform plan`:

```gherkin
# tests/security.feature
Feature: Security policies

  Scenario: All databases must be encrypted
    Given I have aws_db_instance defined
    Then it must contain storage_encrypted
    And its value must be true

  Scenario: No instances in unapproved regions
    Given I have aws_instance defined
    Then it must contain provider
    And its value must be "aws.us-east-1"
```

```bash
terraform plan -out=tfplan
terraform-compliance -p tfplan -f tests/
```

Useful for non-engineers (compliance, security teams) to author rules.

---

## Layer 6: End-to-end tests (Terratest)

Actually deploy infrastructure, assert against real cloud, tear down.

```go
// test/ecs_service_test.go
package test

import (
    "testing"
    "github.com/gruntwork-io/terratest/modules/terraform"
    "github.com/gruntwork-io/terratest/modules/aws"
    "github.com/stretchr/testify/assert"
)

func TestEcsService(t *testing.T) {
    terraformOptions := &terraform.Options{
        TerraformDir: "../examples/ecs-service",
        Vars: map[string]interface{}{
            "environment": "test",
            "name":        "terratest-" + random.UniqueId(),
        },
    }
    
    defer terraform.Destroy(t, terraformOptions)
    
    terraform.InitAndApply(t, terraformOptions)
    
    serviceName := terraform.Output(t, terraformOptions, "service_name")
    assert.NotEmpty(t, serviceName)
    
    // Verify the ECS service is actually running
    aws.GetEcsService(t, "us-east-1", "test-cluster", serviceName)
    
    // Hit the ALB and verify response
    albDNS := terraform.Output(t, terraformOptions, "alb_dns")
    http.GetWithRetry(t, "https://" + albDNS + "/health", 200, "OK", 30, 10*time.Second)
}
```

Pros:
- Tests real cloud behaviour, not just static analysis
- Catches issues only visible at runtime (IAM permission gaps, network reachability)

Cons:
- Slow (5-30 minutes per test)
- Costs money (real cloud resources)
- Flaky (cloud APIs are eventually consistent)

Use Terratest for **modules** (your reusable building blocks), not every environment apply.

---

## Layer 7: Drift tests

Already covered in [Drift Detection](drift-detection.md), but worth listing as a testing layer:

```bash
# Daily in CI
terraform plan -detailed-exitcode
# Exit 2 = drift = test failed
```

---

## Putting it together — CI test pipeline

```yaml
# .github/workflows/terraform-test.yml
name: Terraform Tests

on: [pull_request]

jobs:
  fast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      
      - name: Format check
        run: terraform fmt -check -recursive
      
      - name: Validate (every directory)
        run: |
          for d in $(find infra -name '*.tf' | xargs -n1 dirname | sort -u); do
            (cd "$d" && terraform init -backend=false && terraform validate)
          done
      
      - name: tflint
        uses: terraform-linters/setup-tflint@v4
      - run: tflint --init && tflint --recursive

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Checkov
        uses: bridgecrewio/checkov-action@master
        with:
          directory: infra/
          framework: terraform
      - name: tfsec
        uses: aquasecurity/tfsec-action@v1.0.3

  policy:
    runs-on: ubuntu-latest
    needs: fast
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123:role/terraform-plan
          aws-region: us-east-1
      - working-directory: infra/environments/dev
        run: |
          terraform init
          terraform plan -out=tfplan
          terraform show -json tfplan > plan.json
      - run: |
          curl -L -o conftest.tar.gz \
            https://github.com/open-policy-agent/conftest/releases/latest/download/conftest_Linux_x86_64.tar.gz
          tar xzf conftest.tar.gz
          ./conftest test --policy policy/ infra/environments/dev/plan.json

  e2e:
    runs-on: ubuntu-latest
    needs: [fast, security, policy]
    if: github.event.pull_request.labels.*.name contains 'run-e2e'   # opt-in
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
      - run: cd test && go test -v -timeout 60m ./...
```

Fast layers run on every push. Security and policy gate the merge. E2E is opt-in (slow, expensive).

---

## Testing CDK / Pulumi differs

CDK and Pulumi let you write **real unit tests**:

```python
# CDK
def test_db_is_encrypted():
    app = App()
    stack = MyStack(app, "Test")
    template = Template.from_stack(stack)
    template.has_resource_properties("AWS::RDS::DBInstance", {
        "StorageEncrypted": True,
    })
```

```typescript
// Pulumi
const stack = new MyStack();
const encrypted = await stack.dbInstance.storageEncrypted.apply(v => v);
expect(encrypted).toBe(true);
```

This is the killer feature of code-based IaC: standard test frameworks just work.

---

## Testing strategy by team size

| Team size | Layers used |
|---|---|
| Solo / 2-3 engineers | fmt, validate, tflint, Checkov |
| 5-10 engineers | + OPA/Sentinel for required tags + drift detection |
| 10-50 engineers | + Terratest for shared modules + automated cost estimation |
| 50+ engineers | + custom policy framework + IaC platform (Terraform Cloud, Spacelift) |

Don't skip the cheap layers. Most teams skip OPA and regret it.

---

## Cost testing

Surprise AWS bills come from IaC mistakes (an `r6g.16xlarge` instead of `r6g.large`). Tools:

- **Infracost** — estimates monthly cost from `terraform plan`, posts as PR comment
- **Terraform Cloud** — built-in cost estimation
- **AWS Pricing Calculator** — manual

```yaml
- name: Infracost
  uses: infracost/actions/setup@v2
- run: |
    infracost breakdown --path=infra/environments/production --format=json --out-file=infracost.json
    infracost comment github --path=infracost.json --pull-request=${{ github.event.number }}
```

Infracost catches the "you're about to provision $40k/month of compute" before merge.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you treat infra code with the same rigour as app code.

**Strong answer pattern:**
1. fmt + validate on every push (cheapest, run first)
2. tflint catches deprecated/unused issues; Checkov + tfsec catch security
3. Policy as Code (OPA / Sentinel) for org-wide rules: required tags, allowed regions, encrypted-at-rest
4. Terratest for modules, not every environment — too slow
5. Drift detection in production catches what tests don't

**Common follow-up:** *"What do you do when Checkov flags a finding you've decided to accept?"*
> Suppress with explicit comment in code: `# checkov:skip=CKV_AWS_24:public access intentional for static site`. Document why. Review suppressions periodically. Never `--soft-fail` globally — the suppression should be per-finding, per-resource.

---

## Related topics

- [Terraform in CI/CD Lifecycle](terraform-cicd-lifecycle.md) — where these tests fit
- [Best Practices](best-practices.md) — what tests should enforce
- [Drift Detection](drift-detection.md) — runtime testing
- [Security in CI/CD](../cicd/security-in-cicd.md) — broader security scanning
