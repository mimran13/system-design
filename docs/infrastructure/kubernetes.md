# Kubernetes

## What it is

Kubernetes (K8s) is a container orchestration platform that automates deployment, scaling, health management, and service discovery for containerized applications.

```
Without Kubernetes:
  "Run order-service on server-1 and server-2"
  → Server-1 crashes → manual action to start on server-3
  → Traffic spikes → manually SSH to add servers
  → New version → SSH to each server, restart one at a time
  → 50 services → O(50) manual operations

With Kubernetes:
  "Run 3 replicas of order-service, always"
  → Pod crashes → K8s restarts it automatically
  → Traffic spikes → HPA scales to 10 replicas automatically
  → New version → rolling update, automatic rollback on failure
  → 50 services → declarative config, consistent automation
```

## Core objects

### Pod

The smallest deployable unit — one or more containers that share network and storage.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: order-service-abc123
  labels:
    app: order-service
    version: v1.2.3
spec:
  containers:
    - name: order-service
      image: 123456789.dkr.ecr.us-east-1.amazonaws.com/order-service:v1.2.3
      ports:
        - containerPort: 8080
      env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: order-service-secrets
              key: database-url
      resources:
        requests:
          memory: "256Mi"
          cpu: "250m"
        limits:
          memory: "512Mi"
          cpu: "500m"
      livenessProbe:
        httpGet:
          path: /health/live
          port: 8080
        initialDelaySeconds: 15
        periodSeconds: 10
        failureThreshold: 3
      readinessProbe:
        httpGet:
          path: /health/ready
          port: 8080
        periodSeconds: 5
        failureThreshold: 3
```

### Deployment

Manages a set of identical pods with rolling updates and rollback:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # allow 1 extra pod during update
      maxUnavailable: 0  # never reduce below 3 pods
  template:
    metadata:
      labels:
        app: order-service
        version: v1.2.3
    spec:
      # Spread pods across availability zones
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: order-service
      
      # Prefer different nodes
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    app: order-service
                topologyKey: kubernetes.io/hostname
      
      containers:
        - name: order-service
          image: 123456789.dkr.ecr.us-east-1.amazonaws.com/order-service:v1.2.3
          # ... (same as Pod spec above)
      
      # Graceful shutdown
      terminationGracePeriodSeconds: 30
```

```bash
# Rollout operations
kubectl rollout status deployment/order-service
kubectl rollout history deployment/order-service
kubectl rollout undo deployment/order-service           # rollback
kubectl rollout undo deployment/order-service --to-revision=3
```

### Service

Stable network endpoint for a set of pods (pods come and go, Service IP is stable):

```yaml
# ClusterIP: internal access only
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: production
spec:
  selector:
    app: order-service  # routes to all pods with this label
  ports:
    - protocol: TCP
      port: 8080       # service port
      targetPort: 8080 # pod port
  type: ClusterIP      # internal DNS: order-service.production.svc.cluster.local
```

```yaml
# LoadBalancer: external access (creates AWS ALB/NLB)
spec:
  type: LoadBalancer
  # Or use AWS Load Balancer Controller with Ingress (more control)
```

### Ingress

HTTP/HTTPS routing from outside the cluster:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/ssl-redirect: "443"
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:123:certificate/...
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /orders
            pathType: Prefix
            backend:
              service:
                name: order-service
                port:
                  number: 8080
          - path: /payments
            pathType: Prefix
            backend:
              service:
                name: payment-service
                port:
                  number: 8080
```

### ConfigMap and Secret

```yaml
# ConfigMap: non-sensitive configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: order-service-config
data:
  LOG_LEVEL: "INFO"
  MAX_CONNECTIONS: "100"
  FEATURE_FLAG_PROMO: "true"

# Secret: sensitive data (base64 encoded, not encrypted by default!)
apiVersion: v1
kind: Secret
metadata:
  name: order-service-secrets
type: Opaque
stringData:  # auto-base64-encodes
  database-url: "postgresql://user:pass@db:5432/orders"
  stripe-key: "sk_live_..."
# Use External Secrets Operator to sync from AWS Secrets Manager
```

## Autoscaling

### Horizontal Pod Autoscaler (HPA)

Scale out/in based on metrics:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 3
  maxReplicas: 50
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70  # scale up if CPU > 70%
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    # Custom metric (from Prometheus via KEDA or custom metrics adapter)
    - type: External
      external:
        metric:
          name: sqs_queue_depth
          selector:
            matchLabels:
              queue: order-processing
        target:
          type: Value
          value: "100"  # scale if queue depth > 100
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60  # wait 60s before scaling up again
      policies:
        - type: Pods
          value: 4    # add at most 4 pods at a time
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300  # wait 5min before scaling down
```

### Cluster Autoscaler / Karpenter

Automatically add/remove EC2 nodes:

```yaml
# Karpenter NodePool (newer, AWS-specific)
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]
        - key: node.kubernetes.io/instance-type
          operator: In
          values: ["m5.large", "m5.xlarge", "m5.2xlarge"]
      nodeClassRef:
        name: default
  limits:
    cpu: 1000
  disruption:
    consolidationPolicy: WhenUnderutilized
    consolidateAfter: 30s  # remove underutilized nodes quickly
```

## Health probes

```yaml
containers:
  - name: order-service
    # Liveness: is the container alive? (restart if fails)
    livenessProbe:
      httpGet:
        path: /health/live
        port: 8080
      initialDelaySeconds: 15    # wait for startup
      periodSeconds: 10
      failureThreshold: 3        # 3 consecutive failures → restart
      successThreshold: 1
    
    # Readiness: is it ready to receive traffic? (remove from LB if fails)
    readinessProbe:
      httpGet:
        path: /health/ready
        port: 8080
      periodSeconds: 5
      failureThreshold: 3        # 3 consecutive failures → remove from service
    
    # Startup: longer timeout for slow-starting apps
    startupProbe:
      httpGet:
        path: /health/live
        port: 8080
      failureThreshold: 30       # 30 × 10s = 5 min to start
      periodSeconds: 10
```

```python
# Health endpoint implementation
@app.get("/health/live")
async def liveness():
    # Basic: is the process alive?
    return {"status": "ok"}

@app.get("/health/ready")
async def readiness():
    # Check dependencies: DB, cache, required external services
    checks = {
        "database": await check_db(),
        "cache": await check_redis(),
    }
    
    if all(checks.values()):
        return {"status": "ready", "checks": checks}
    
    # Return 503 to remove from load balancer
    raise HTTPException(503, {"status": "not ready", "checks": checks})
```

## Namespace and RBAC

```yaml
# Separate teams via namespaces
apiVersion: v1
kind: Namespace
metadata:
  name: payments
  labels:
    team: payments

# RBAC: payments team can only deploy in payments namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: payments
  name: deployer
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "create", "update", "patch"]
  - apiGroups: [""]
    resources: ["pods", "services"]
    verbs: ["get", "list"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  namespace: payments
  name: payments-team-deployer
subjects:
  - kind: Group
    name: payments-team  # from SSO/OIDC
roleRef:
  kind: Role
  name: deployer
  apiGroup: rbac.authorization.k8s.io
```

## Network policies

Micro-segmentation between pods:

```yaml
# Only order-service can reach payment-service
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: payment-service-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: payment-service
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: order-service
      ports:
        - protocol: TCP
          port: 8080
  # Default: deny all other ingress
```

## EKS (AWS Elastic Kubernetes Service)

```bash
# Create EKS cluster
eksctl create cluster \
  --name production \
  --region us-east-1 \
  --nodegroup-name standard \
  --node-type m5.large \
  --nodes 3 \
  --nodes-min 3 \
  --nodes-max 20 \
  --managed  # managed node groups (AWS patches nodes)

# Or with Fargate (serverless nodes):
eksctl create cluster \
  --name production \
  --fargate
```

**EKS integrations:**
- **ALB Ingress Controller:** Ingress → creates AWS ALB with target groups
- **EBS CSI Driver:** PersistentVolume → AWS EBS volume
- **EFS CSI Driver:** ReadWriteMany volumes → AWS EFS
- **Karpenter:** node autoscaling (preferred over Cluster Autoscaler on EKS)
- **External Secrets Operator:** syncs Secrets Manager → K8s Secrets
- **IRSA (IAM Roles for Service Accounts):** pods assume IAM roles without access keys

```yaml
# IRSA: pod gets IAM role permissions without AWS credentials in env
apiVersion: v1
kind: ServiceAccount
metadata:
  name: order-service
  namespace: production
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/order-service-role
```

## Interview angle

!!! tip "What interviewers are testing"
    K8s comes up in "how do you deploy and scale microservices?"

**Strong answer pattern:**
1. Deployment + Service + Ingress = the trio for a web service
2. HPA scales pods; Karpenter scales nodes — both needed for elastic systems
3. Readiness probe removes pod from load balancer before shutdown; liveness restarts unhealthy pods
4. Pod anti-affinity + topology spread = high availability across AZs
5. IRSA for AWS permissions — no access keys needed in pods
6. EKS + Fargate for operational simplicity; managed node groups if you need control

## Related topics

- [Containers](containers.md) — what K8s orchestrates
- [Service Mesh](service-mesh.md) — Istio on Kubernetes
- [CI/CD](../cicd/index.md) — deploying to Kubernetes
- [Deployments](../cicd/deployment-strategies.md) — K8s deployment strategies
- [Zero Trust](../security/zero-trust.md) — NetworkPolicy + RBAC
