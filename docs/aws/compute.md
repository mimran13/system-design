# AWS Compute

## Decision tree

```
Containerized workload?
├── Need Kubernetes portability? → EKS
├── AWS-native, simpler? → ECS
└── No node management? → Fargate (ECS or EKS)

Event-driven / short tasks? → Lambda

Simple web app, no infra? → App Runner

Need full OS / GPU / custom networking? → EC2
```

## EC2

Virtual machines — baseline for everything else.

### Instance families

| Family | Optimized for | Use case |
|---|---|---|
| t3/t4g | Burstable CPU | Dev, low-traffic |
| m5/m6i/m7i | General purpose | Most services |
| c5/c6i/c7i | Compute | CPU-bound processing |
| r5/r6i/r7i | Memory | Databases, in-memory stores |
| p3/p4d | GPU (training) | ML training |
| g4dn/g5 | GPU (inference) | ML inference |
| i3/i4i | NVMe SSD | I/O-intensive databases |

### Purchase models

```
On-Demand:   full price, no commitment
             → dev/test, unpredictable spikes

Reserved (1yr/3yr): 40–60% discount
             → stable production baseline

Savings Plans: commit to $/hour spend, flexible instance type
             → like Reserved but more flexible

Spot:        spare capacity, up to 90% off
             → batch, fault-tolerant, stateless workers
             → can be interrupted with 2-minute warning

Best production pattern: Reserved baseline + Spot for scaling
```

### Auto Scaling Group

```yaml
# CloudFormation: mixed instances (on-demand base + spot scaling)
OrderServiceASG:
  Type: AWS::AutoScaling::AutoScalingGroup
  Properties:
    MinSize: 2
    MaxSize: 20
    MixedInstancesPolicy:
      InstancesDistribution:
        OnDemandBaseCapacity: 2
        OnDemandPercentageAboveBaseCapacity: 0  # scale with spot
        SpotAllocationStrategy: capacity-optimized
      LaunchTemplate:
        Overrides:
          - InstanceType: m5.large
          - InstanceType: m5.xlarge
          - InstanceType: m4.large
    TargetGroupARNs: [!Ref ALBTargetGroup]
    HealthCheckType: ELB
    HealthCheckGracePeriod: 60
```

## ECS (Elastic Container Service)

AWS-native container orchestration. Two launch types:

**EC2 launch type:** You manage EC2 nodes in the cluster.  
**Fargate:** AWS manages the compute — you only define the container.

### ECS Fargate task definition

```json
{
  "family": "order-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::123:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123:role/order-service-task-role",
  "containerDefinitions": [{
    "name": "order-service",
    "image": "123.dkr.ecr.us-east-1.amazonaws.com/order-service:v1.2.3",
    "portMappings": [{"containerPort": 8080}],
    "secrets": [{
      "name": "DATABASE_URL",
      "valueFrom": "arn:aws:secretsmanager:us-east-1:123:secret:prod/db-url"
    }],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/order-service",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:8080/health/live || exit 1"],
      "interval": 10, "timeout": 3, "retries": 3
    }
  }]
}
```

### ECS service auto-scaling

```python
client = boto3.client('application-autoscaling')

# Register scalable target
client.register_scalable_target(
    ServiceNamespace='ecs',
    ResourceId='service/production/order-service',
    ScalableDimension='ecs:service:DesiredCount',
    MinCapacity=3,
    MaxCapacity=50,
)

# Scale on CPU
client.put_scaling_policy(
    PolicyName='cpu-tracking',
    ServiceNamespace='ecs',
    ResourceId='service/production/order-service',
    ScalableDimension='ecs:service:DesiredCount',
    PolicyType='TargetTrackingScaling',
    TargetTrackingScalingPolicyConfiguration={
        'TargetValue': 70.0,
        'PredefinedMetricSpecification': {
            'PredefinedMetricType': 'ECSServiceAverageCPUUtilization'
        },
        'ScaleInCooldown': 300,
        'ScaleOutCooldown': 60,
    }
)
```

### ECS vs EKS

| | ECS | EKS |
|---|---|---|
| Complexity | Low | High |
| AWS integration | Native | Good (via controllers) |
| Portability | AWS only | Kubernetes standard |
| Ecosystem | AWS-centric | Huge K8s ecosystem |
| Service mesh | App Mesh | Istio, App Mesh, Linkerd |
| Best for | AWS teams, simpler ops | K8s expertise, multi-cloud |

## EKS (Elastic Kubernetes Service)

Managed Kubernetes. AWS manages the control plane; you manage nodes (or use Fargate).

```bash
# Create cluster with Karpenter for node autoscaling
eksctl create cluster \
  --name production \
  --region us-east-1 \
  --with-oidc \           # enables IRSA (IAM Roles for Service Accounts)
  --managed               # managed node groups

# IRSA: pod gets IAM role without hardcoded credentials
kubectl annotate serviceaccount order-service \
  eks.amazonaws.com/role-arn=arn:aws:iam::123:role/order-service-role
```

**Key EKS add-ons:**
- **AWS Load Balancer Controller** — Ingress → ALB, Service → NLB
- **EBS/EFS CSI Driver** — PersistentVolumes on AWS storage
- **Karpenter** — node autoscaling (preferred over Cluster Autoscaler)
- **External Secrets Operator** — sync Secrets Manager → K8s Secrets
- **AWS Distro for OpenTelemetry** — metrics/traces to CloudWatch/X-Ray

## Lambda

Serverless functions. Pay per invocation and duration, not idle time.

```python
# Lambda handler pattern
import json

def handler(event, context):
    # context.get_remaining_time_in_millis() → time until timeout
    # context.aws_request_id → unique request ID
    
    for record in event.get('Records', []):  # SQS batch
        body = json.loads(record['body'])
        process(body)
    
    return {'statusCode': 200}
```

### Lambda limits

| Parameter | Value |
|---|---|
| Memory | 128 MB – 10 GB |
| Timeout | Up to 15 minutes |
| Concurrency | 1,000/region (soft, raise via quota) |
| Deployment size | 50 MB (zip), 10 GB (container image) |
| Payload (sync) | 6 MB request/response |
| /tmp storage | 512 MB – 10 GB |

### Cold start times

| Runtime | Cold start (typical) |
|---|---|
| Python / Node.js | 100–500 ms |
| Go | 10–100 ms |
| Java (JVM) | 500 ms – 5 s |
| Java (SnapStart) | ~1 s (snapshot restore) |

**Provisioned Concurrency:** keeps N instances warm, eliminates cold starts. Use for latency-sensitive functions.

### Lambda event sources

| Trigger | Pattern |
|---|---|
| API Gateway / ALB | Synchronous HTTP |
| SQS | Poll → batch (up to 10,000 messages) |
| SNS | Push fan-out |
| DynamoDB Streams | CDC / change processing |
| S3 | Object created/deleted |
| EventBridge | Scheduled cron or event-driven |
| Kinesis | Stream processing |
| Step Functions | Workflow step |

## App Runner

Fully managed containers — simplest path from image to HTTPS endpoint:

```bash
aws apprunner create-service \
  --service-name order-api \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "123.dkr.ecr.us-east-1.amazonaws.com/order-service:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {"Port": "8080"}
    },
    "AutoDeploymentsEnabled": true
  }' \
  --instance-configuration '{"Cpu": "1 vCPU", "Memory": "2 GB"}'
```

Provides: HTTPS, auto-scaling (to zero), health checks, load balancing — no ALB/ECS config.

## Choosing compute for system design interviews

| Scenario | Choice | Reason |
|---|---|---|
| REST API (simple) | Lambda + API Gateway | Serverless, no idle cost |
| REST API (high traffic) | ECS Fargate + ALB | Persistent, predictable latency |
| REST API (complex, many services) | EKS + ALB Ingress | K8s ecosystem |
| SQS worker | Lambda or ECS | Lambda for low volume, ECS for high |
| Scheduled job (< 15 min) | Lambda + EventBridge | Simple, serverless |
| Long-running batch | ECS Fargate or AWS Batch | No 15-min Lambda limit |
| ML inference | Lambda (container) or SageMaker | Depends on model size |

## Related topics

- [Containers](../infrastructure/containers.md)
- [Kubernetes](../infrastructure/kubernetes.md)
- [Serverless](../architecture/serverless.md)
- [Load Balancing](../networking/load-balancing.md)
