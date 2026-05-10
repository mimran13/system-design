# Infrastructure as Code (IaC)

## What it is

Infrastructure as Code is the practice of defining and managing infrastructure (servers, networks, databases, load balancers) through code rather than manual processes. Infrastructure becomes versioned, reviewable, and reproducible.

```
Manual provisioning:
  Click through AWS Console → inconsistent, unrepeatable
  "What did I configure?" → nobody knows
  Recreate environment → takes days, never exactly the same
  
IaC:
  Define infra in code → version controlled in Git
  Apply: creates/updates/destroys resources automatically
  Any environment → identical (dev = staging = prod minus scale)
  Audit: git log shows every infra change
  Disaster recovery: re-apply to rebuild from scratch
```

## Terraform

The dominant multi-cloud IaC tool. Declarative — you describe desired state, Terraform figures out what to create/update/delete.

### Core concepts

```hcl
# main.tf

# Provider: which cloud and credentials
provider "aws" {
  region = var.aws_region
}

# Resource: an infrastructure object
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  
  tags = {
    Name        = "${var.environment}-vpc"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Data source: reference existing resources (not managed by this Terraform)
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}

# Variable: parameterize configuration
variable "environment" {
  description = "Environment name"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "aws_region" {
  default = "us-east-1"
}

# Output: expose values for use by other modules or humans
output "vpc_id" {
  description = "The VPC ID"
  value       = aws_vpc.main.id
}
```

### Complete ECS service example

```hcl
# modules/ecs-service/main.tf

resource "aws_ecs_cluster" "main" {
  name = "${var.name}-cluster"
  
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = var.name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn
  
  container_definitions = jsonencode([{
    name  = var.name
    image = "${var.ecr_repository_url}:${var.image_tag}"
    
    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]
    
    environment = [
      { name = "ENVIRONMENT", value = var.environment },
      { name = "LOG_LEVEL",   value = "INFO" },
    ]
    
    secrets = [
      {
        name      = "DATABASE_URL"
        valueFrom = var.database_secret_arn
      }
    ]
    
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "ecs"
      }
    }
    
    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:${var.container_port}/health/live || exit 1"]
      interval    = 10
      timeout     = 3
      retries     = 3
      startPeriod = 30
    }
  }])
}

resource "aws_ecs_service" "app" {
  name            = var.name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.min_tasks
  launch_type     = "FARGATE"
  
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }
  
  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = var.name
    container_port   = var.container_port
  }
  
  # Rolling deployment configuration
  deployment_circuit_breaker {
    enable   = true
    rollback = true  # auto-rollback if health checks fail
  }
  
  deployment_controller {
    type = "ECS"  # or "CODE_DEPLOY" for blue/green
  }
  
  lifecycle {
    ignore_changes = [desired_count]  # let autoscaling manage this
  }
}

# Auto-scaling
resource "aws_appautoscaling_target" "app" {
  max_capacity       = var.max_tasks
  min_capacity       = var.min_tasks
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.name}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.app.resource_id
  scalable_dimension = aws_appautoscaling_target.app.scalable_dimension
  service_namespace  = aws_appautoscaling_target.app.service_namespace
  
  target_tracking_scaling_policy_configuration {
    target_value = 70.0
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
```

### State management

```hcl
# backend.tf — store state remotely (required for teams)
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "production/order-service/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "alias/terraform-state-key"
    
    # Prevent concurrent applies
    dynamodb_table = "terraform-state-locks"
  }
}
```

```bash
# Workflow
terraform init      # download providers, configure backend
terraform plan      # show what will change (ALWAYS review before apply)
terraform apply     # create/update resources
terraform destroy   # destroy all resources
```

### Module structure

```
infrastructure/
├── modules/                    # reusable modules
│   ├── networking/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── ecs-service/
│   └── rds/
├── environments/
│   ├── dev/
│   │   ├── main.tf             # uses modules with dev settings
│   │   ├── terraform.tfvars    # dev-specific values
│   │   └── backend.tf
│   ├── staging/
│   └── production/
└── global/                     # ECR, IAM roles (shared across environments)
```

## AWS CDK (Cloud Development Kit)

Define infrastructure using real programming languages (TypeScript, Python, Java):

```python
# Python CDK example
from aws_cdk import (
    Stack, Duration, RemovalPolicy,
    aws_ecs as ecs,
    aws_ecs_patterns as ecs_patterns,
    aws_ec2 as ec2,
    aws_elasticloadbalancingv2 as elbv2,
    aws_ecr as ecr,
    aws_secretsmanager as sm,
)
from constructs import Construct

class OrderServiceStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs):
        super().__init__(scope, construct_id, **kwargs)
        
        # VPC
        vpc = ec2.Vpc(self, "OrderServiceVpc",
            max_azs=3,
            nat_gateways=1,
        )
        
        # ECS Cluster
        cluster = ecs.Cluster(self, "Cluster",
            vpc=vpc,
            container_insights=True,
        )
        
        # ECR Repository
        ecr_repo = ecr.Repository.from_repository_name(
            self, "EcrRepo", "order-service"
        )
        
        # Fargate service with ALB (single construct!)
        service = ecs_patterns.ApplicationLoadBalancedFargateService(
            self, "OrderService",
            cluster=cluster,
            cpu=512,
            memory_limit_mib=1024,
            desired_count=3,
            task_image_options=ecs_patterns.ApplicationLoadBalancedTaskImageOptions(
                image=ecs.ContainerImage.from_ecr_repository(
                    ecr_repo, tag=self.node.try_get_context("image_tag") or "latest"
                ),
                environment={
                    "ENVIRONMENT": "production",
                    "LOG_LEVEL": "INFO",
                },
                secrets={
                    "DATABASE_URL": ecs.Secret.from_secrets_manager(
                        sm.Secret.from_secret_name_v2(
                            self, "DbSecret", "production/order-service/db"
                        ),
                        field="url"
                    )
                },
                container_port=8080,
            ),
            public_load_balancer=True,
        )
        
        # Auto-scaling
        scalable_target = service.service.auto_scale_task_count(
            min_capacity=3,
            max_capacity=50,
        )
        scalable_target.scale_on_cpu_utilization("CpuScaling",
            target_utilization_percent=70,
            scale_in_cooldown=Duration.seconds(300),
            scale_out_cooldown=Duration.seconds(60),
        )
```

```bash
# CDK workflow
cdk synth     # generates CloudFormation templates (review these)
cdk diff      # show what will change
cdk deploy    # deploy stack
cdk destroy   # destroy stack
```

### Terraform vs CDK

| | Terraform | CDK |
|---|---|---|
| **Language** | HCL (domain-specific) | Python, TypeScript, Java, Go, C# |
| **Multi-cloud** | Yes (AWS, GCP, Azure, etc.) | AWS only (CDK for Terraform exists) |
| **Logic** | Limited (conditionals, loops) | Full programming language |
| **Abstractions** | Modules | Constructs (composable, testable) |
| **State** | External (S3 + DynamoDB) | CloudFormation manages |
| **Ecosystem** | Huge (Terraform Registry) | CDK construct libraries |
| **Testing** | `terraform validate`, Terratest | `cdk assert`, standard unit tests |
| **Best for** | Multi-cloud, existing Terraform teams | AWS-native, prefer code over HCL |

## IaC best practices

```
1. Never store secrets in IaC
   ✗ password = "my-secret"
   ✓ Reference Secrets Manager: aws_secretsmanager_secret_version.db.secret_string

2. Pin provider versions
   terraform {
     required_providers {
       aws = { version = "~> 5.0" }  # minor updates ok, not major
     }
   }

3. Use remote state with locking (S3 + DynamoDB)
   → Prevents two engineers applying simultaneously (state corruption)

4. Review terraform plan before every apply
   → Never apply without reviewing changes

5. Use workspaces or directories for environments
   → Never have a single state file for dev + production

6. Tag everything
   tags = {
     Environment = var.environment
     Team        = "payments"
     ManagedBy   = "terraform"
     CostCenter  = "order-platform"
   }
   → Required for cost allocation, security auditing

7. Drift detection
   → terraform plan in CI on a schedule
   → Alert if plan shows unexpected changes (someone modified manually)
```

## AWS CloudFormation

AWS's native IaC. More verbose than Terraform/CDK, but no additional tools:

```yaml
# cloudformation.yml
AWSTemplateFormatVersion: '2010-09-09'
Description: Order Service

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, production]
  
  ImageTag:
    Type: String

Resources:
  ECSCluster:
    Type: AWS::ECS::Cluster
    Properties:
      ClusterName: !Sub "${Environment}-order-cluster"
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
      ContainerDefinitions:
        - Name: order-service
          Image: !Sub "${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/order-service:${ImageTag}"
          PortMappings:
            - ContainerPort: 8080
```

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you understand infrastructure reproducibility and team collaboration.

**Strong answer pattern:**
1. IaC = version-controlled infrastructure — every change is a PR, reviewed, auditable
2. Remote state with locking — S3 + DynamoDB prevents concurrent apply conflicts
3. Environments as code — dev/staging/prod are the same code, different variable values
4. Never secrets in IaC — reference Secrets Manager or Parameter Store
5. CDK for AWS-heavy shops; Terraform for multi-cloud or existing HCL teams

## Related topics

- [CI/CD](../cicd/index.md) — IaC applied by the pipeline
- [Containers](../infrastructure/containers.md) — what IaC provisions runs containers
- [Secrets Management](../security/secrets-management.md) — reference secrets, don't embed
- [Kubernetes](../infrastructure/kubernetes.md) — Helm + Kustomize as IaC for K8s
