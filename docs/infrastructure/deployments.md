# Deployment Strategies

## Why strategy matters

How you deploy determines your risk, downtime, and ability to respond to problems:

```
Big bang deployment:
  Stop all v1 → Deploy v2 → Start v2
  Downtime:        YES (minutes to hours)
  Rollback speed:  Slow (re-deploy v1)
  Risk:            HIGH (all-or-nothing)

Rolling deployment:
  Replace v1 pods one at a time with v2
  Downtime:        Zero (usually)
  Rollback speed:  Fast (update image tag back)
  Risk:            Medium (catch bugs when small % on v2)

Canary deployment:
  5% traffic to v2, 95% stays on v1 → ramp up
  Downtime:        Zero
  Rollback speed:  Instant (cut traffic back to v1)
  Risk:            Very low (real traffic, tiny blast radius)
```

## Rolling deployment

Replace pods incrementally. Kubernetes native:

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 10
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2        # add up to 2 extra pods (12 total)
      maxUnavailable: 0  # never drop below 10
```

```
t=0:  [v1 v1 v1 v1 v1 v1 v1 v1 v1 v1]   (10 v1)
t=30: [v2 v2 v1 v1 v1 v1 v1 v1 v1 v1]   (2 v2, 8 v1)
t=60: [v2 v2 v2 v2 v1 v1 v1 v1 v1 v1]   (4 v2, 6 v1)
...
t=4m: [v2 v2 v2 v2 v2 v2 v2 v2 v2 v2]   (10 v2)
```

**Automatic rollback on failure:**
```bash
kubectl rollout status deployment/order-service
# Watches readiness probes — if new pod never becomes ready, rollout pauses
kubectl rollout undo deployment/order-service  # if needed
```

**Limitations:**
- During rollout, v1 and v2 are both serving requests
- API must be backward compatible (v1 clients + v2 clients both running)
- Database migrations must be additive (run before deploy, not during)

## Blue/Green deployment

Run two identical environments, switch traffic between them:

```
Blue (current v1):   [order-service-blue]  ← 100% traffic
Green (new v2):      [order-service-green] ← 0% traffic (warming up)

Test green in staging → switch ALB target group → Green serves 100%

Blue becomes standby → rollback = switch back to Blue (instant)
```

```python
# AWS: switch ECS services via ALB target groups
elbv2 = boto3.client('elbv2')

# Get current listener rule
listener_rule = elbv2.describe_rules(ListenerArn=LISTENER_ARN)
current_tg = listener_rule['Rules'][0]['Actions'][0]['TargetGroupArn']

# Switch traffic: Blue → Green
if current_tg == BLUE_TARGET_GROUP_ARN:
    new_tg = GREEN_TARGET_GROUP_ARN
else:
    new_tg = BLUE_TARGET_GROUP_ARN

elbv2.modify_rule(
    RuleArn=RULE_ARN,
    Actions=[{
        'Type': 'forward',
        'TargetGroupArn': new_tg,
    }]
)
```

### AWS CodeDeploy blue/green for ECS

```yaml
# appspec.yml for ECS blue/green
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: <TASK_DEFINITION>
        LoadBalancerInfo:
          ContainerName: order-service
          ContainerPort: 8080
        PlatformVersion: LATEST

Hooks:
  - BeforeAllowTraffic: RunIntegrationTests  # Lambda runs tests on green
  - AfterAllowTraffic: CleanupOldVersion
```

**Pros:**
- Instant rollback — just switch load balancer back
- No mixed versions in production
- Full test of new version before traffic switch

**Cons:**
- Double the resources during deployment (cost)
- Stateful services (websocket connections) are dropped on switch
- Database must handle both versions simultaneously (if kept warm)

## Canary deployment

Route a small percentage of traffic to the new version, monitor, then gradually increase:

```
Phase 1:  1% → v2, 99% → v1   (monitor for 5 minutes)
Phase 2:  5% → v2, 95% → v1   (monitor for 10 minutes)
Phase 3: 25% → v2, 75% → v1   (monitor for 20 minutes)
Phase 4: 50% → v2, 50% → v1
Phase 5: 100% → v2             (promote)

Rollback: drop % back to 0% at any point
```

### Kubernetes with Argo Rollouts

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: order-service
spec:
  replicas: 10
  strategy:
    canary:
      steps:
        - setWeight: 10   # 10% to canary
        - pause: {duration: 5m}  # wait and monitor
        - setWeight: 25
        - pause: {duration: 10m}
        - setWeight: 50
        - pause: {duration: 10m}
        - setWeight: 100  # full rollout
      
      # Automatic rollback based on metrics
      analysis:
        templates:
          - templateName: error-rate-check
        startingStep: 1
        args:
          - name: service-name
            value: order-service
  
  selector:
    matchLabels:
      app: order-service
  template:
    # ... pod spec
```

```yaml
# AnalysisTemplate: measure error rate during canary
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: error-rate-check
spec:
  metrics:
    - name: error-rate
      interval: 1m
      failureLimit: 3
      provider:
        prometheus:
          address: http://prometheus:9090
          query: |
            sum(rate(http_requests_total{
              app="order-service",
              status_code=~"5.."
            }[5m]))
            / sum(rate(http_requests_total{
              app="order-service"
            }[5m]))
      successCondition: result[0] <= 0.01   # fail if error rate > 1%
```

### AWS ALB weighted routing

```python
# ALB weighted target groups (without K8s)
elbv2.modify_rule(
    RuleArn=RULE_ARN,
    Actions=[{
        'Type': 'forward',
        'ForwardConfig': {
            'TargetGroups': [
                {'TargetGroupArn': STABLE_TG_ARN, 'Weight': 90},  # v1
                {'TargetGroupArn': CANARY_TG_ARN, 'Weight': 10},  # v2 (10%)
            ],
            'TargetGroupStickinessConfig': {
                'Enabled': True,
                'DurationSeconds': 300  # stick users to same version
            }
        }
    }]
)
```

## Feature flags

Decouple deployment from release — deploy the code, release to users separately:

```python
from functools import wraps
import boto3
import json

# AWS AppConfig for feature flags
class FeatureFlags:
    def __init__(self):
        self._flags = {}
        self._refresh()
    
    def _refresh(self):
        client = boto3.client('appconfig')
        response = client.get_configuration(
            Application='order-service',
            Environment='production',
            Configuration='feature-flags',
            ClientId='order-service-instance',
        )
        if response['Content'].read():
            self._flags = json.loads(response['Content'].read())
    
    def is_enabled(self, flag: str, user_id: str = None) -> bool:
        flag_config = self._flags.get(flag, {'enabled': False})
        
        if not flag_config.get('enabled', False):
            return False
        
        # Percentage rollout
        if rollout_pct := flag_config.get('rollout_percentage'):
            if user_id:
                # Consistent: same user always gets same result
                user_hash = int(hashlib.md5(f"{flag}{user_id}".encode()).hexdigest(), 16)
                return (user_hash % 100) < rollout_pct
        
        return True

flags = FeatureFlags()

@app.post("/orders")
async def create_order(request: CreateOrderRequest, current_user: User = Depends(...)):
    if flags.is_enabled("new_order_flow", user_id=current_user.id):
        return await new_order_service.create(request)
    return await order_service.create(request)
```

**Feature flag use cases:**
- Dark launch: code deployed but feature off (test infrastructure load)
- Gradual rollout: 1% → 10% → 100% of users
- A/B testing: 50% see variant A, 50% see B
- Kill switch: disable feature instantly without deploy

## Database migration strategy

Database changes must be decoupled from deploys (backward compatibility):

```
WRONG: Deploy new code and migration simultaneously
  → If deploy fails, DB already migrated → rollback is painful

RIGHT: Expand → Contract (2-phase migration)

Phase 1 (Expand): Add new column (nullable), keep old column
  ALTER TABLE orders ADD COLUMN status_v2 VARCHAR(50);
  → Both old (v1) and new (v2) code work
  
Deploy v2 code (writes to both columns during transition)
  
Phase 2 (Contract): After all v1 code is gone, remove old column
  ALTER TABLE orders DROP COLUMN status_old;
```

```python
# Migration tool: Alembic (SQLAlchemy)
# migrations/versions/0042_add_status_v2.py

def upgrade():
    # Expand: safe to run before or during deploy
    op.add_column('orders', sa.Column('status_v2', sa.String(50), nullable=True))
    
    # Backfill (run in background job, not migration)
    # op.execute("UPDATE orders SET status_v2 = status WHERE status_v2 IS NULL")

def downgrade():
    op.drop_column('orders', 'status_v2')
```

## Comparison

| Strategy | Downtime | Rollback | Resources | Use case |
|---|---|---|---|---|
| **Big bang** | Yes | Slow | 1x | Non-production, tiny apps |
| **Rolling** | No | Fast | 1x (temp surge) | Most services |
| **Blue/Green** | No | Instant | 2x | Stateless services, need instant rollback |
| **Canary** | No | Instant | 1.1x | High-risk changes, need real user validation |
| **Feature flag** | No | Instant | 1x | Risky features, gradual rollout |

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you understand risk management in deployments.

**Strong answer pattern:**
1. Rolling is the default for most microservices (zero downtime, K8s native)
2. Canary for high-risk changes — real user traffic at 1%, auto-rollback on error spike
3. Blue/Green for stateful services where you need instant complete rollback
4. Feature flags decouple deploy from release — most powerful for product experiments
5. Database migrations: always expand-then-contract — never break backward compatibility

## Related topics

- [CI/CD](cicd.md) — pipeline that drives deployments
- [Kubernetes](kubernetes.md) — rolling updates, Argo Rollouts
- [Load Balancing](../networking/load-balancing.md) — weighted routing for canary
- [Circuit Breaker](../patterns/circuit-breaker.md) — auto-rollback signal
- [Metrics](../observability/metrics.md) — canary analysis metrics
