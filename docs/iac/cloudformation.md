# AWS CloudFormation

CloudFormation is AWS's native IaC service. Templates (YAML/JSON) describe AWS resources; CloudFormation creates and manages stacks. Less ergonomic than Terraform or CDK, but no third-party tooling required and deeply integrated with AWS.

---

## What it is

```
You write:               CloudFormation:           AWS:
template.yaml      →     parses → creates    →     resources exist
(YAML resources)         change set → executes
                         tracks stack state
```

The CloudFormation **service** runs server-side in your AWS account. You upload a template; AWS does the rest.

---

## Anatomy of a template

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Order Service infrastructure

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, production]
  ImageTag:
    Type: String
    Description: ECR image tag (commit SHA)

Mappings:
  EnvConfig:
    dev:        { MinTasks: 1, MaxTasks: 3,  InstanceType: db.t3.small }
    staging:    { MinTasks: 2, MaxTasks: 10, InstanceType: db.t3.medium }
    production: { MinTasks: 3, MaxTasks: 50, InstanceType: db.r6g.xlarge }

Conditions:
  IsProduction: !Equals [!Ref Environment, production]

Resources:
  EcsCluster:
    Type: AWS::ECS::Cluster
    Properties:
      ClusterName: !Sub "${Environment}-orders"
      ClusterSettings:
        - Name: containerInsights
          Value: enabled

  TaskDefinition:
    Type: AWS::ECS::TaskDefinition
    Properties:
      Family: order-service
      NetworkMode: awsvpc
      RequiresCompatibilities: [FARGATE]
      Cpu: '512'
      Memory: '1024'
      ExecutionRoleArn: !GetAtt ExecutionRole.Arn
      ContainerDefinitions:
        - Name: order-service
          Image: !Sub "${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/order-service:${ImageTag}"
          PortMappings:
            - ContainerPort: 8080
              Protocol: tcp
          Environment:
            - Name: ENVIRONMENT
              Value: !Ref Environment
          LogConfiguration:
            LogDriver: awslogs
            Options:
              awslogs-group: !Ref LogGroup
              awslogs-region: !Ref AWS::Region
              awslogs-stream-prefix: ecs

  EcsService:
    Type: AWS::ECS::Service
    Properties:
      Cluster: !Ref EcsCluster
      TaskDefinition: !Ref TaskDefinition
      DesiredCount: !FindInMap [EnvConfig, !Ref Environment, MinTasks]
      LaunchType: FARGATE
      DeploymentConfiguration:
        DeploymentCircuitBreaker:
          Enable: true
          Rollback: true

  LogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub "/ecs/${Environment}/order-service"
      RetentionInDays: !If [IsProduction, 90, 30]

Outputs:
  ServiceArn:
    Value: !Ref EcsService
    Export:
      Name: !Sub "${AWS::StackName}-ServiceArn"
```

### Sections

| Section | Purpose |
|---|---|
| `Parameters` | Inputs (overridden at stack create/update) |
| `Mappings` | Static lookup tables (env → config) |
| `Conditions` | Boolean flags for conditional resources/properties |
| `Resources` | The actual AWS resources to create (only required section) |
| `Outputs` | Values exported for cross-stack references or display |
| `Transform` | Macros (e.g., `AWS::Serverless` for SAM) |

### Intrinsic functions

| Function | What it does |
|---|---|
| `!Ref` | Reference a parameter or resource |
| `!GetAtt` | Get an attribute from a resource (`!GetAtt Role.Arn`) |
| `!Sub` | String interpolation (`!Sub "arn:aws:s3:::${BucketName}"`) |
| `!FindInMap` | Look up in Mappings |
| `!If` | Conditional value |
| `!Join` | Concatenate strings |
| `!ImportValue` | Reference an export from another stack |

---

## Stack lifecycle

```bash
# Create
aws cloudformation create-stack \
  --stack-name order-service-prod \
  --template-body file://template.yaml \
  --parameters ParameterKey=Environment,ParameterValue=production \
               ParameterKey=ImageTag,ParameterValue=$(git rev-parse HEAD) \
  --capabilities CAPABILITY_IAM

# Update via change set (always preview first)
aws cloudformation create-change-set \
  --stack-name order-service-prod \
  --change-set-name update-$(date +%s) \
  --template-body file://template.yaml \
  --parameters ParameterKey=Environment,ParameterValue=production \
               ParameterKey=ImageTag,ParameterValue=NEW_SHA \
  --capabilities CAPABILITY_IAM

# Review the change set
aws cloudformation describe-change-set --change-set-name <arn>

# Execute
aws cloudformation execute-change-set --change-set-name <arn>

# Delete
aws cloudformation delete-stack --stack-name order-service-prod
```

### Stack states

```
CREATE_IN_PROGRESS → CREATE_COMPLETE
CREATE_IN_PROGRESS → CREATE_FAILED → ROLLBACK_IN_PROGRESS → ROLLBACK_COMPLETE

UPDATE_IN_PROGRESS → UPDATE_COMPLETE
UPDATE_IN_PROGRESS → UPDATE_FAILED → UPDATE_ROLLBACK_IN_PROGRESS
                                  → UPDATE_ROLLBACK_COMPLETE
                                  → UPDATE_ROLLBACK_FAILED  ← stuck, needs manual fix
```

### `UPDATE_ROLLBACK_FAILED`

The most painful stack state. CloudFormation tried to roll back, but rollback also failed. Stack is stuck.

```bash
# Skip the failed resources during rollback continuation
aws cloudformation continue-update-rollback \
  --stack-name <name> \
  --resources-to-skip ResourceLogicalId1 ResourceLogicalId2
```

You may need to manually fix the broken resources first.

---

## Change sets

A change set is a preview: "if I update with this template, here's what will happen."

```
Resource: ECS Service
  Action: Modify (no replacement)
  Property: DesiredCount: 3 → 5

Resource: RDS Instance
  Action: Replace          ← DESTRUCTIVE
  Reason: DBInstanceIdentifier changed
```

Always create and review a change set before executing. CDK's `cdk diff` and `cdk deploy` use change sets under the hood.

---

## Cross-stack references

### Exports / `ImportValue`

Stack A:

```yaml
Outputs:
  VpcId:
    Value: !Ref Vpc
    Export:
      Name: prod-vpc-id
```

Stack B:

```yaml
Resources:
  Subnet:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !ImportValue prod-vpc-id
```

**Limitation**: once exported and imported, the export cannot be deleted while consumers exist. This makes refactoring painful.

### Nested stacks

Compose multiple templates into one parent stack:

```yaml
Resources:
  Networking:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://s3.amazonaws.com/templates/networking.yaml
      Parameters:
        Environment: !Ref Environment
  
  Application:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://s3.amazonaws.com/templates/application.yaml
      Parameters:
        VpcId: !GetAtt Networking.Outputs.VpcId
```

Easier to refactor than exports/imports because everything is one parent.

---

## CloudFormation drift detection

CloudFormation can detect when actual AWS state differs from the template (someone changed something via console).

```bash
aws cloudformation detect-stack-drift --stack-name order-service-prod
aws cloudformation describe-stack-resource-drifts --stack-name order-service-prod
```

Output: list of drifted resources with diff. Drift detection is **read-only** — does not fix anything. Once you know the drift, either revert manually or update the template.

---

## CloudFormation in CI/CD

```yaml
# .github/workflows/cfn-deploy.yml
name: CloudFormation Deploy

on:
  push:
    branches: [main]
    paths: ['cloudformation/**']

permissions:
  id-token: write
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/cfn-validate
          aws-region: us-east-1
      - run: |
          aws cloudformation validate-template \
            --template-body file://cloudformation/order-service.yaml
      - name: cfn-lint
        run: |
          pip install cfn-lint
          cfn-lint cloudformation/*.yaml
      - name: cfn-nag (security)
        run: |
          gem install cfn-nag
          cfn_nag_scan --input-path cloudformation/

  deploy-staging:
    needs: validate
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/cfn-deploy-staging
          aws-region: us-east-1
      - name: Deploy
        run: |
          aws cloudformation deploy \
            --stack-name order-service-staging \
            --template-file cloudformation/order-service.yaml \
            --parameter-overrides \
                Environment=staging \
                ImageTag=${{ github.sha }} \
            --capabilities CAPABILITY_IAM \
            --no-fail-on-empty-changeset
```

`aws cloudformation deploy` is a higher-level command that handles change sets automatically.

---

## SAM (Serverless Application Model)

SAM is a CloudFormation extension for serverless apps with shorter syntax:

```yaml
Transform: AWS::Serverless-2016-10-31

Resources:
  HelloFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: index.handler
      Runtime: python3.11
      CodeUri: ./src
      Events:
        Api:
          Type: Api
          Properties:
            Path: /hello
            Method: get
```

The `Transform` macro expands this into ~15 underlying CloudFormation resources (Lambda, API Gateway, IAM role, log group). Use SAM if you're Lambda-heavy.

---

## CloudFormation vs Terraform vs CDK

| | CloudFormation | Terraform | CDK |
|---|---|---|---|
| **Native to AWS** | Yes | No | Yes (synthesises to CFN) |
| **Multi-cloud** | No | Yes | Limited (CDKTF) |
| **State management** | AWS service | Self-managed (S3 + DynamoDB) | AWS service |
| **Drift detection** | Built-in | `terraform plan` | Inherited from CFN |
| **Speed** | Slow (CFN polling) | Fast plan | Slow (CFN polling) |
| **Logic** | Limited (intrinsic functions) | HCL constructs | Full programming language |
| **Ecosystem** | AWS only | Vast (every cloud + 1000s of providers) | AWS only |
| **Best for** | AWS-only, no extra tooling | Multi-cloud, polyglot teams | AWS-native, prefer code over YAML |

### When to use CloudFormation directly

- AWS-only, want zero third-party dependencies
- Heavy use of CloudFormation-specific features (StackSets, Service Catalog)
- AWS support cases need template included
- Existing CFN templates you don't want to migrate

### When to skip CloudFormation

- You want speed and a richer ecosystem (Terraform)
- You want to write infra in code (CDK)
- You need multi-cloud (Terraform / Pulumi)

---

## CloudFormation StackSets

Deploy the same stack across many accounts/regions from one place:

```bash
aws cloudformation create-stack-set \
  --stack-set-name guardrails \
  --template-body file://guardrails.yaml \
  --capabilities CAPABILITY_NAMED_IAM

aws cloudformation create-stack-instances \
  --stack-set-name guardrails \
  --accounts 111111111 222222222 333333333 \
  --regions us-east-1 us-west-2
```

Used heavily in AWS Organizations for landing zones and centralised guardrails.

---

## Common pitfalls

**1. Capabilities errors.**

Templates that create IAM resources require `--capabilities CAPABILITY_IAM` or `CAPABILITY_NAMED_IAM`. AWS forces explicit acknowledgement.

**2. Template size limits.**

40KB inline, 1MB via S3. Large templates → split into nested stacks or use CDK.

**3. Update behaviour varies per resource.**

Changing some properties is in-place; changing others forces replacement. The CFN docs list update behaviour per property — read them.

**4. Hard to refactor with exports.**

Once `Export` is consumed by `ImportValue`, you can't change or delete the export. Plan ahead or use CDK's higher-level constructs.

**5. Stuck stacks.**

`UPDATE_ROLLBACK_FAILED` and orphaned resources happen. Recovery sometimes requires manually fixing then `continue-update-rollback`.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you know CloudFormation as a foundation — even if your team uses CDK or Terraform.

**Strong answer pattern:**
1. CloudFormation is AWS's native IaC; CDK and SAM compile to CloudFormation
2. Stacks are atomic — full deploy or full rollback
3. Change sets preview updates — use them in CI before executing
4. Drift detection exists but is read-only; fix manually or update template
5. Pick CFN if AWS-only with no extra tooling; pick Terraform/CDK if you want better ergonomics

**Common follow-up:** *"Why is CloudFormation slower than Terraform?"*
> CloudFormation runs server-side and polls each resource for state changes. Each resource update is a CFN API call with eventual consistency. Terraform makes API calls directly and tracks results in local state — fewer hops, faster feedback. The trade-off is CFN's atomic rollback semantics.

---

## Related topics

- [Terraform](terraform.md) — the popular alternative
- [CDK](cdk.md) — synthesises to CloudFormation
- [Terraform in CI/CD Lifecycle](terraform-cicd-lifecycle.md) — same lifecycle for CFN
- [AWS Compute](../aws/compute.md) — what CFN provisions
