# AWS CodePipeline (and CodeBuild, CodeDeploy)

AWS's native CI/CD suite. Less popular than GitHub Actions / GitLab CI for general use, but compelling when you're deeply AWS-integrated, need fine-grained IAM, or want to keep everything inside one cloud account.

---

## The three services

| Service | Role |
|---|---|
| **CodeBuild** | Runs build/test commands (the "CI") |
| **CodeDeploy** | Deploys to ECS, EC2, Lambda (the "CD") |
| **CodePipeline** | Orchestrates the stages end-to-end |

You can use them together or independently:

- CodeBuild alone — run builds, ignore the rest
- CodeBuild + CodeDeploy — build then deploy, manually triggered
- All three via CodePipeline — full pipeline-as-IaC

---

## Why use CodePipeline

- **AWS-native auth** — IAM roles end-to-end; no OIDC trust setup
- **Fine-grained permissions** — every action is an IAM permission
- **Cost** — pay for runtime only, no per-minute base cost (CodePipeline ~$1/active pipeline/month)
- **Direct AWS integrations** — built-in actions for ECS, Lambda, S3, ECR, CloudFormation
- **Approval gates** with IAM-controlled approvers
- **All in one account** — CloudTrail logs everything; no third-party data flow

Strong fit when:

- AWS-only org
- Strict IAM/audit requirements
- Want one bill, one console, one auth model

Weaker fit when:

- Multi-cloud
- Want a polished pipeline editing UX (GitHub Actions YAML > CodePipeline JSON)
- Use GitHub-centric workflows (PR comments, environments) — CodePipeline doesn't replicate these well

---

## CodeBuild

Runs commands in a Docker container. Configured via `buildspec.yml`:

```yaml
# buildspec.yml
version: 0.2

env:
  variables:
    PYTHON_VERSION: '3.11'
  parameter-store:
    DOCKER_REGISTRY: /codebuild/docker-registry
  secrets-manager:
    DEPLOY_TOKEN: production/deploy-token:token

phases:
  install:
    runtime-versions:
      python: 3.11
    commands:
      - pip install --upgrade pip
  
  pre_build:
    commands:
      - aws ecr get-login-password --region us-east-1 \
          | docker login --username AWS --password-stdin $DOCKER_REGISTRY
      - pip install -r requirements.txt -r requirements-dev.txt
  
  build:
    commands:
      - ruff check .
      - mypy src/
      - pytest tests/ --cov=src --cov-fail-under=80
      - docker build -t $DOCKER_REGISTRY/myapp:$CODEBUILD_RESOLVED_SOURCE_VERSION .
  
  post_build:
    commands:
      - docker push $DOCKER_REGISTRY/myapp:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - printf '[{"name":"myapp","imageUri":"%s"}]' \
          $DOCKER_REGISTRY/myapp:$CODEBUILD_RESOLVED_SOURCE_VERSION \
          > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
    - appspec.yaml
    - taskdef.json

cache:
  paths:
    - '/root/.cache/pip/**/*'
```

### Project definition (Terraform)

```hcl
resource "aws_codebuild_project" "myapp" {
  name         = "myapp-build"
  service_role = aws_iam_role.codebuild.arn
  
  artifacts {
    type = "CODEPIPELINE"
  }
  
  environment {
    compute_type    = "BUILD_GENERAL1_MEDIUM"
    image           = "aws/codebuild/standard:7.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = true   # required for Docker builds
    
    environment_variable {
      name  = "AWS_REGION"
      value = "us-east-1"
    }
  }
  
  source {
    type      = "CODEPIPELINE"
    buildspec = "buildspec.yml"
  }
  
  cache {
    type = "S3"
    location = "${aws_s3_bucket.codebuild_cache.bucket}/cache"
  }
}
```

### CodeBuild instance sizes

| Size | vCPU | Memory | Cost (relative) |
|---|---|---|---|
| BUILD_GENERAL1_SMALL | 3 | 7 GB | 1× |
| BUILD_GENERAL1_MEDIUM | 4 | 7 GB | 2× |
| BUILD_GENERAL1_LARGE | 8 | 15 GB | 4× |
| BUILD_GENERAL1_2XLARGE | 72 | 144 GB | 32× |
| BUILD_GENERAL1_GPU | 4 | 16 GB + GPU | varies |

ARM equivalents (cheaper, similar perf for non-x86 builds): `BUILD_GENERAL1_*_ARM`.

---

## CodeDeploy

Deploys artifacts to compute targets. Three deployment types based on target:

### EC2/On-Premises

```yaml
# appspec.yml for EC2
version: 0.0
os: linux

files:
  - source: /
    destination: /opt/myapp

hooks:
  ApplicationStop:
    - location: scripts/stop.sh
      timeout: 60
  
  ApplicationStart:
    - location: scripts/start.sh
      timeout: 120
  
  ValidateService:
    - location: scripts/healthcheck.sh
      timeout: 60
```

### ECS

```yaml
# appspec.yml for ECS
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: <TASK_DEFINITION>
        LoadBalancerInfo:
          ContainerName: myapp
          ContainerPort: 8080

Hooks:
  - BeforeAllowTraffic: arn:aws:lambda:us-east-1:123:function:pre-traffic-hook
  - AfterAllowTraffic: arn:aws:lambda:us-east-1:123:function:post-traffic-hook
```

ECS deployments via CodeDeploy support **blue/green** with traffic shifting.

### Lambda

```yaml
# appspec.yml for Lambda
version: 0.0
Resources:
  - myFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: myapp-function
        Alias: live
        CurrentVersion: 1
        TargetVersion: 2

Hooks:
  - BeforeAllowTraffic: arn:aws:lambda:...:pre-hook
  - AfterAllowTraffic: arn:aws:lambda:...:post-hook
```

### Deployment configurations (traffic shifting)

| Configuration | Behaviour |
|---|---|
| `AllAtOnce` | Shift 100% traffic immediately |
| `Linear10PercentEvery1Minute` | Shift 10% per minute |
| `Canary10Percent5Minutes` | 10% for 5 min, then 100% |
| `Canary10Percent30Minutes` | Slower canary |

Custom configs are supported.

---

## CodePipeline

The orchestrator. Stages with actions; each action runs CodeBuild, CodeDeploy, or other services.

### Pipeline definition (Terraform)

```hcl
resource "aws_codepipeline" "main" {
  name     = "myapp-pipeline"
  role_arn = aws_iam_role.pipeline.arn
  
  artifact_store {
    location = aws_s3_bucket.artifacts.bucket
    type     = "S3"
    encryption_key {
      id   = aws_kms_key.artifacts.arn
      type = "KMS"
    }
  }
  
  stage {
    name = "Source"
    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source"]
      configuration = {
        ConnectionArn    = aws_codestarconnections_connection.github.arn
        FullRepositoryId = "myorg/myrepo"
        BranchName       = "main"
        DetectChanges    = "true"
      }
    }
  }
  
  stage {
    name = "Build"
    action {
      name             = "Build"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["source"]
      output_artifacts = ["build"]
      configuration = {
        ProjectName = aws_codebuild_project.myapp.name
      }
    }
  }
  
  stage {
    name = "DeployStaging"
    action {
      name             = "DeployStaging"
      category         = "Deploy"
      owner            = "AWS"
      provider         = "CodeDeployToECS"
      version          = "1"
      input_artifacts  = ["build"]
      configuration = {
        ApplicationName                = "myapp"
        DeploymentGroupName            = "staging"
        TaskDefinitionTemplateArtifact = "build"
        AppSpecTemplateArtifact        = "build"
        Image1ArtifactName             = "build"
        Image1ContainerName            = "myapp"
      }
    }
  }
  
  stage {
    name = "ApprovalForProduction"
    action {
      name     = "ManualApproval"
      category = "Approval"
      owner    = "AWS"
      provider = "Manual"
      version  = "1"
      configuration = {
        NotificationArn = aws_sns_topic.approvals.arn
        CustomData      = "Approve production deploy?"
      }
    }
  }
  
  stage {
    name = "DeployProduction"
    action {
      name             = "DeployProduction"
      category         = "Deploy"
      owner            = "AWS"
      provider         = "CodeDeployToECS"
      version          = "1"
      input_artifacts  = ["build"]
      configuration = {
        ApplicationName     = "myapp"
        DeploymentGroupName = "production"
        # ... same template artifacts
      }
    }
  }
}
```

### Source providers

| Provider | Notes |
|---|---|
| `CodeStarSourceConnection` | GitHub, GitLab, Bitbucket — most common |
| `CodeCommit` | AWS-native Git (deprecated for new use) |
| `S3` | Trigger on object upload |
| `ECR` | Trigger on image push |

### Approval action

Sends to SNS; humans click "Approve" or "Reject" in console. Configure required approver IAM permissions:

```hcl
resource "aws_iam_policy" "approvers" {
  name = "pipeline-approvers"
  policy = jsonencode({
    Statement = [{
      Effect = "Allow"
      Action = "codepipeline:PutApprovalResult"
      Resource = "arn:aws:codepipeline:*:*:myapp-pipeline/ApprovalForProduction/ManualApproval"
    }]
  })
}
```

---

## CodePipeline + CodeBuild + ECS — full example

```
GitHub push to main
  │
  ▼
[Source]                                  ← CodeStar connection to GitHub
  │
  ▼
[Build]                                   ← CodeBuild runs buildspec.yml
  │   - lint, test
  │   - docker build, push to ECR
  │   - output imagedefinitions.json
  ▼
[DeployStaging]                           ← CodeDeploy to ECS staging
  │   - Update task definition with new image
  │   - Rolling deploy
  │   - Wait for stable
  ▼
[IntegrationTests]                        ← CodeBuild runs e2e tests
  │
  ▼
[ApprovalForProduction]                   ← Human gate (SNS notification)
  │
  ▼
[DeployProduction]                        ← CodeDeploy blue/green to ECS prod
  │   - 10% canary for 30min
  │   - Auto-rollback on CloudWatch alarms
  │   - 100% cutover after canary success
```

---

## Cross-account deploys

Production usually lives in a separate AWS account.

```
Tooling account:
  - CodePipeline
  - CodeBuild
  - ECR (multi-account read access)

Production account:
  - ECS services
  - CodeDeploy deployment groups
  - IAM role assumable by tooling account's pipeline role
```

```hcl
# In tooling account
resource "aws_codepipeline" "main" {
  stage {
    name = "DeployProduction"
    action {
      role_arn = "arn:aws:iam::PROD_ACCOUNT:role/codepipeline-deploy-role"
      # ...
    }
  }
}
```

The pipeline role in the tooling account has `sts:AssumeRole` on the prod account role. Deploy actions execute as the prod account role.

---

## CodePipeline vs GitHub Actions

| Concern | CodePipeline | GitHub Actions |
|---|---|---|
| AWS auth | Native IAM | OIDC + IAM role |
| Marketplace ecosystem | Limited | Vast |
| Pipeline-as-IaC | YAML/JSON in repo or via Terraform/CDK | YAML in repo |
| PR integration | Limited (no PR comments natively) | Deep |
| Multi-cloud | AWS-only | Any cloud |
| Pricing | $1/pipeline/month + CodeBuild minutes | $0.008/min self-hosted, free for OSS |
| UI | AWS Console | GitHub UI |
| Approval gates | IAM-controlled | GitHub Environments |
| Audit | CloudTrail | GitHub audit log |

**Most teams** end up on GitHub Actions or GitLab CI even on AWS — the ecosystem and PR integration win.

**CodePipeline shines** when:
- Heavy AWS-only org with strict IAM/audit
- Want everything in one cloud bill
- Use CodeBuild for builds anyway (IAM-native auth to AWS resources during build)

A hybrid is common: GitHub Actions for CI (build, test, push image), CodePipeline for production deploys (IAM-controlled approval gates).

---

## CDK Pipelines

Build CDK pipelines that self-mutate when the pipeline definition changes:

```python
from aws_cdk import pipelines

pipeline = pipelines.CodePipeline(self, "Pipeline",
    synth=pipelines.ShellStep("Synth",
        input=pipelines.CodePipelineSource.git_hub("myorg/myrepo", "main"),
        commands=["npm ci", "npm run build", "npx cdk synth"]
    ),
)

stage = MyAppStage(self, "Production")
pipeline.add_stage(stage,
    pre=[pipelines.ManualApprovalStep("ApproveProduction")],
)
```

CDK Pipelines wraps CodePipeline with sane defaults. Worth using if you're already CDK.

---

## Common gotchas

| Issue | Fix |
|---|---|
| `imagedefinitions.json` format mismatch | Output exact JSON expected by CodeDeploy |
| Pipeline stuck on "Source" | Webhook misconfigured; check CodeStar connection |
| Cross-account deploys fail | Trust policy on target role doesn't allow source role |
| CodeBuild can't pull private packages | IAM role missing CodeArtifact / S3 perms |
| Slow Docker builds | `privileged_mode: true` + Docker layer cache via `cache_from` (S3) |
| Pipeline expensive at scale | Many small pipelines = many $1/month; consolidate |

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you know the AWS-native option exists and when it makes sense, even if you don't use it daily.

**Strong answer pattern:**
1. CodePipeline orchestrates; CodeBuild builds; CodeDeploy deploys
2. Native IAM auth — no OIDC setup, but tightly coupled to AWS
3. CodeDeploy supports blue/green with traffic shifting on ECS and Lambda
4. Cross-account deploys via assume-role from tooling account
5. Most teams pick GitHub Actions for CI; CodePipeline for IAM-gated prod deploys is reasonable hybrid

**Common follow-up:** *"When would you NOT use CodePipeline?"*
> When the team is comfortable with GitHub Actions, deeply integrated with PR workflows, or multi-cloud. CodePipeline's CI ergonomics are dated; its strength is being inside AWS for IAM-native integrations and audit. If those don't matter, GitHub Actions is more productive.

---

## Related topics

- [Pipelines](pipelines.md) — comparison with other CI/CD tools
- [Deployment Strategies](deployment-strategies.md) — CodeDeploy traffic shifting
- [AWS Compute](../aws/compute.md) — what CodePipeline deploys to
- [IAM and Cross-Account](../security/authn-authz.md)
