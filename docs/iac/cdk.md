# AWS CDK (Cloud Development Kit)

CDK lets you define AWS infrastructure in a real programming language — TypeScript, Python, Java, Go, C# — instead of HCL or YAML. Under the hood, CDK synthesises CloudFormation, which actually creates the resources. This page covers when to choose CDK over Terraform, the core concepts, and the typical lifecycle.

---

## What it is

```
You write:                        CDK does:                  AWS does:
TypeScript/Python code      →     synth → CloudFormation  →  creates resources
(app.ts, stack.ts)                template (JSON/YAML)       via CloudFormation API
```

CDK is **synthesis-time abstraction**. You write high-level code; CDK lowers it to CloudFormation; CloudFormation runs it.

---

## Hello world

```python
from aws_cdk import App, Stack, aws_s3 as s3
from constructs import Construct

class MyStack(Stack):
    def __init__(self, scope: Construct, id: str, **kwargs):
        super().__init__(scope, id, **kwargs)
        
        s3.Bucket(self, "MyBucket",
            versioned=True,
            encryption=s3.BucketEncryption.S3_MANAGED,
            removal_policy=RemovalPolicy.RETAIN,
        )

app = App()
MyStack(app, "MyStack", env={"region": "us-east-1"})
app.synth()
```

```bash
cdk synth     # generate CloudFormation
cdk diff      # show what will change
cdk deploy    # apply
cdk destroy   # tear down
```

---

## Core concepts

### Construct

The fundamental unit. Every CDK class extends `Construct`. There are three levels:

| Level | Name | Maps to |
|---|---|---|
| L1 | CFN constructs (`CfnBucket`) | Direct CloudFormation resource |
| L2 | Curated constructs (`Bucket`) | Resource with sensible defaults + helpers |
| L3 | Patterns (`ApplicationLoadBalancedFargateService`) | Multi-resource composition |

L2 is the sweet spot. L1 when you need a CloudFormation feature CDK hasn't wrapped yet. L3 for very common patterns.

### Stack

A collection of constructs that deploy as one CloudFormation stack.

```python
class NetworkingStack(Stack):
    def __init__(self, scope, id, **kwargs):
        super().__init__(scope, id, **kwargs)
        self.vpc = ec2.Vpc(self, "Vpc", max_azs=3)

class ApplicationStack(Stack):
    def __init__(self, scope, id, vpc, **kwargs):
        super().__init__(scope, id, **kwargs)
        ecs.Cluster(self, "Cluster", vpc=vpc)

app = App()
network = NetworkingStack(app, "Network")
ApplicationStack(app, "App", vpc=network.vpc)
```

Stacks can reference each other; CDK manages the cross-stack outputs.

### App

The root container — one CDK app can contain many stacks.

---

## Realistic example: ECS service with ALB

```python
from aws_cdk import (
    App, Stack, Duration, RemovalPolicy,
    aws_ec2 as ec2,
    aws_ecs as ecs,
    aws_ecs_patterns as ecs_patterns,
    aws_ecr as ecr,
    aws_logs as logs,
    aws_secretsmanager as sm,
)
from constructs import Construct

class OrderServiceStack(Stack):
    def __init__(self, scope, id, *, environment: str, image_tag: str, **kwargs):
        super().__init__(scope, id, **kwargs)

        vpc = ec2.Vpc(self, "Vpc",
            max_azs=3,
            nat_gateways=1 if environment == "dev" else 3,
        )

        cluster = ecs.Cluster(self, "Cluster",
            vpc=vpc,
            container_insights=True,
        )

        ecr_repo = ecr.Repository.from_repository_name(self, "Repo", "order-service")
        db_secret = sm.Secret.from_secret_name_v2(
            self, "DbSecret", f"{environment}/order-service/db"
        )

        log_group = logs.LogGroup(self, "Logs",
            log_group_name=f"/ecs/{environment}/order-service",
            retention=logs.RetentionDays.ONE_MONTH if environment != "production" else logs.RetentionDays.THREE_MONTHS,
            removal_policy=RemovalPolicy.RETAIN if environment == "production" else RemovalPolicy.DESTROY,
        )

        # L3: ALB-fronted Fargate service in one construct
        service = ecs_patterns.ApplicationLoadBalancedFargateService(
            self, "Service",
            cluster=cluster,
            cpu=512,
            memory_limit_mib=1024,
            desired_count=3 if environment == "production" else 1,
            task_image_options=ecs_patterns.ApplicationLoadBalancedTaskImageOptions(
                image=ecs.ContainerImage.from_ecr_repository(ecr_repo, tag=image_tag),
                container_port=8080,
                environment={
                    "ENVIRONMENT": environment,
                    "LOG_LEVEL": "INFO",
                },
                secrets={
                    "DATABASE_URL": ecs.Secret.from_secrets_manager(db_secret, "url"),
                },
                log_driver=ecs.LogDrivers.aws_logs(stream_prefix="ecs", log_group=log_group),
            ),
            public_load_balancer=True,
            health_check_grace_period=Duration.seconds(30),
        )

        service.target_group.configure_health_check(
            path="/health/live",
            healthy_threshold_count=2,
            interval=Duration.seconds(10),
        )

        # Auto-scaling
        scalable = service.service.auto_scale_task_count(
            min_capacity=3 if environment == "production" else 1,
            max_capacity=50 if environment == "production" else 5,
        )
        scalable.scale_on_cpu_utilization("CpuScaling",
            target_utilization_percent=70,
            scale_in_cooldown=Duration.seconds(300),
            scale_out_cooldown=Duration.seconds(60),
        )

app = App()
OrderServiceStack(app, "OrderService-Dev",
    environment="dev",
    image_tag=app.node.try_get_context("image_tag") or "latest",
    env={"region": "us-east-1"},
)
OrderServiceStack(app, "OrderService-Prod",
    environment="production",
    image_tag=app.node.try_get_context("image_tag") or "latest",
    env={"region": "us-east-1", "account": "123456789"},
)
app.synth()
```

Compare to Terraform: ~200 lines of HCL for the same thing, all explicit. CDK trades verbosity for less reusability outside AWS.

---

## CDK in CI/CD

```yaml
# .github/workflows/cdk-deploy.yml
name: CDK Deploy

on:
  push:
    branches: [main]
    paths:
      - 'cdk/**'

permissions:
  id-token: write
  contents: read

jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g aws-cdk
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r cdk/requirements.txt
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/cdk-diff
          aws-region: us-east-1
      - working-directory: cdk
        run: cdk diff --context image_tag=${{ github.sha }}

  deploy:
    needs: diff
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      # ... same setup
      - working-directory: cdk
        run: cdk deploy --all --require-approval never --context image_tag=${{ github.sha }}
```

`cdk diff` is the equivalent of `terraform plan`. `cdk deploy` is `terraform apply`. The lifecycle is identical to [Terraform's](terraform-cicd-lifecycle.md).

---

## Bootstrapping

CDK requires one-time bootstrap per account/region:

```bash
cdk bootstrap aws://123456789/us-east-1
```

This creates an S3 bucket and IAM roles CDK uses for asset uploads (Lambda code, container images, large templates) and deploys. Run it once per account/region.

---

## Testing CDK code

CDK supports actual unit tests because you're writing real code:

```python
import pytest
from aws_cdk import App
from aws_cdk.assertions import Template, Match
from cdk.order_service_stack import OrderServiceStack

def test_creates_ecs_service():
    app = App()
    stack = OrderServiceStack(app, "Test", environment="dev", image_tag="test")
    template = Template.from_stack(stack)
    
    template.has_resource_properties("AWS::ECS::Service", {
        "DesiredCount": 1,
        "LaunchType": "FARGATE",
    })

def test_production_has_higher_replica_count():
    app = App()
    stack = OrderServiceStack(app, "Test", environment="production", image_tag="test")
    template = Template.from_stack(stack)
    
    template.has_resource_properties("AWS::ECS::Service", {
        "DesiredCount": 3,
    })

def test_logs_retention_is_set():
    app = App()
    stack = OrderServiceStack(app, "Test", environment="production", image_tag="test")
    template = Template.from_stack(stack)
    
    template.has_resource_properties("AWS::Logs::LogGroup", {
        "RetentionInDays": 90,
    })
```

`Template.from_stack` synthesises the stack without deploying and lets you assert on the resulting CloudFormation.

---

## CDK vs Terraform vs CloudFormation

| | Terraform | CDK | CloudFormation |
|---|---|---|---|
| **Language** | HCL | TypeScript, Python, Java, Go, C# | YAML/JSON |
| **Multi-cloud** | Yes | AWS only (CDK for Terraform exists) | AWS only |
| **Logic** | Limited (count, for_each, conditional) | Full programming language | Limited (intrinsic functions) |
| **Abstractions** | Modules | Constructs (composable, testable) | Nested stacks |
| **State** | External (S3 + DynamoDB) | CloudFormation manages | CloudFormation manages |
| **Drift detection** | `terraform plan` | CloudFormation drift detection | CloudFormation drift detection |
| **Ecosystem** | Huge (Terraform Registry, providers for everything) | AWS construct libraries (focused) | AWS only |
| **Testing** | `validate`, Terratest | Real unit tests, `Template.assertions` | `cfn-lint`, `taskcat` |
| **Speed** | Fast plan | Slower (CFN deploy time) | Slower (CFN deploy time) |
| **Best for** | Multi-cloud, polyglot teams | AWS-native, prefer code over HCL | AWS-only, no extra tooling |

### When to choose CDK

- Heavy AWS-only shop
- Team prefers programming languages over DSLs
- Want real unit tests on infrastructure
- Heavy use of L3 patterns (lots of standard ALB+ECS+DB stacks)
- Already using CloudFormation and want to evolve

### When to choose Terraform

- Multi-cloud or hybrid (AWS + GCP, AWS + on-prem)
- Need providers for non-AWS services (Datadog, GitHub, Cloudflare)
- Faster feedback loop matters (`plan` is faster than `cdk diff` + CFN deploy)
- Existing Terraform expertise on team

### CDK for Terraform (CDKTF)

Hybrid: write infra in TypeScript/Python, but the runtime is Terraform (not CloudFormation). Gives you CDK's expressiveness with Terraform's multi-cloud reach. Less mature than CDK or Terraform alone.

---

## Common pitfalls

**1. Logical ID changes destroy resources.**

```python
# Renaming the construct ID changes the CloudFormation logical ID
# CloudFormation sees: delete old, create new — destructive

# Before:
s3.Bucket(self, "MyBucket")

# After (DESTRUCTIVE):
s3.Bucket(self, "MyNewBucket")
```

Use `overrideLogicalId` to keep the old logical ID:

```python
bucket = s3.Bucket(self, "MyNewBucket")
bucket.node.default_child.override_logical_id("MyBucket")
```

**2. CloudFormation 500-resource stack limit.**

Big monolithic stacks hit CloudFormation's resource limits. Split into multiple stacks.

**3. Slow deploys.**

CloudFormation polls every few seconds. A large CDK deploy can take 20+ minutes. Optimise by splitting stacks.

**4. CDK version drift between team members.**

CDK version is defined in `package.json` (TS) or `requirements.txt` (Python). Pin it; bump it deliberately.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you understand the CDK ↔ CloudFormation ↔ AWS chain, and when to pick CDK over Terraform.

**Strong answer pattern:**
1. CDK = "infra in code", but synthesises to CloudFormation under the hood
2. Three abstraction levels (L1/L2/L3); L2 is the default sweet spot
3. State is managed by CloudFormation, not by you — simpler than Terraform's S3+DynamoDB but less flexible
4. Real unit tests possible because it's real code
5. AWS-only by default; CDKTF exists for multi-cloud but less common

**Common follow-up:** *"What happens if `cdk deploy` is interrupted halfway?"*
> CloudFormation rolls back automatically — atomic stack updates. If rollback also fails, the stack ends up in `UPDATE_ROLLBACK_FAILED` and needs manual intervention. This is unlike Terraform where partial state can exist; CDK inherits CloudFormation's all-or-nothing semantics.

---

## Related topics

- [Terraform](terraform.md) — the alternative
- [CloudFormation](cloudformation.md) — what CDK synthesises to
- [Terraform in CI/CD Lifecycle](terraform-cicd-lifecycle.md) — same lifecycle applies to CDK
- [AWS Compute](../aws/compute.md) — what CDK provisions
