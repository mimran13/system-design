# Containers

## What they are

Containers are lightweight, isolated execution environments that package an application with all its dependencies. Unlike VMs, containers share the host OS kernel — making them fast to start (milliseconds vs minutes) and efficient (run 10x more per host).

```
Virtual Machine:
  [App A] [App B] [App C]
  [Guest OS] [Guest OS] [Guest OS]  ← full OS per VM (GBs)
  [Hypervisor]
  [Host OS]
  [Hardware]

Container:
  [App A] [App B] [App C]
  [Container Runtime (Docker)]     ← shared kernel
  [Host OS]
  [Hardware]
  
Containers are isolated via:
  namespaces: process, network, filesystem isolation
  cgroups:    CPU, memory, I/O resource limits
```

## Docker fundamentals

### Dockerfile

```dockerfile
# Multi-stage build (smaller final image)
FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Final stage: only runtime dependencies
FROM python:3.11-slim

WORKDIR /app

# Run as non-root user (security)
RUN useradd -m -u 1000 appuser

# Copy only what's needed from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY --chown=appuser:appuser src/ ./src/

USER appuser

# Immutable port declaration
EXPOSE 8080

# Health check for container orchestrators
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/health/live || exit 1

# Use exec form (not shell form) — receives signals correctly
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### Image layers and caching

```dockerfile
# BAD: invalidates cache on every code change
COPY . .
RUN pip install -r requirements.txt

# GOOD: dependencies cached unless requirements.txt changes
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY src/ ./src/  # only this layer rebuilds on code changes
```

### Image size optimization

```dockerfile
# Baseline: python:3.11  → 900MB
# Slim:     python:3.11-slim  → 150MB
# Alpine:   python:3.11-alpine  → 50MB (but may break C extensions)

# Remove unnecessary files in same RUN command (layer squashing)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*  # cleanup in same layer
```

## Container security

```dockerfile
# 1. Non-root user
USER 1000  # or named user

# 2. Read-only filesystem
# docker run --read-only --tmpfs /tmp myapp

# 3. No new privileges
# docker run --security-opt=no-new-privileges myapp

# 4. Drop capabilities
# docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE myapp

# 5. Scan images for vulnerabilities
# docker scout cves myimage:latest
# trivy image myimage:latest
```

```yaml
# Kubernetes security context
apiVersion: v1
kind: Pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: app
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
      volumeMounts:
        - name: tmp
          mountPath: /tmp  # writable tmpfs for temp files
  volumes:
    - name: tmp
      emptyDir:
        medium: Memory
```

## Container lifecycle

```
Build → Push → Pull → Create → Running → Stopped → Removed

Build:   docker build -t order-service:v1.2.3 .
Push:    docker push registry.example.com/order-service:v1.2.3
Pull:    docker pull registry.example.com/order-service:v1.2.3
Run:     docker run -p 8080:8080 --memory=512m --cpus=0.5 order-service:v1.2.3
Stop:    docker stop <container_id>  # sends SIGTERM, then SIGKILL after 10s
Remove:  docker rm <container_id>
```

### Graceful shutdown

```python
import signal
import sys
import asyncio

class GracefulShutdown:
    def __init__(self):
        self.shutdown_event = asyncio.Event()
        signal.signal(signal.SIGTERM, self._handle_sigterm)
        signal.signal(signal.SIGINT, self._handle_sigterm)
    
    def _handle_sigterm(self, signum, frame):
        print("Received shutdown signal, draining connections...")
        self.shutdown_event.set()

# FastAPI lifespan
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await db_pool.connect()
    
    yield  # app is running
    
    # Shutdown: drain in-flight requests
    print("Shutting down gracefully...")
    await db_pool.disconnect()
    await cache.close()

app = FastAPI(lifespan=lifespan)
```

## Container registries

Where images are stored:

```bash
# ECR (AWS Elastic Container Registry)
# Authenticate
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  123456789.dkr.ecr.us-east-1.amazonaws.com

# Tag and push
docker tag order-service:v1.2.3 \
  123456789.dkr.ecr.us-east-1.amazonaws.com/order-service:v1.2.3
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/order-service:v1.2.3

# ECR lifecycle policy: keep last 10 images, delete older
aws ecr put-lifecycle-policy \
  --repository-name order-service \
  --lifecycle-policy-text '{
    "rules": [{
      "rulePriority": 1,
      "selection": {"tagStatus": "tagged", "countType": "imageCountMoreThan", "countNumber": 10},
      "action": {"type": "expire"}
    }]
  }'
```

## Resource limits

Always set limits — containers without limits can starve neighbors:

```yaml
# Kubernetes resource requests and limits
containers:
  - name: order-service
    resources:
      requests:         # minimum guaranteed resources
        memory: "256Mi"
        cpu: "250m"     # 250 millicores = 0.25 CPU core
      limits:           # maximum allowed
        memory: "512Mi"
        cpu: "500m"
    # OOM kill: container killed if memory > limit (limit > request)
    # CPU throttled (not killed) if CPU > limit
```

```python
# Calculate resource requirements with Little's Law
# L = λW (queue length = arrival rate × wait time)

# RPS: 1000 req/s
# Latency: 50ms per request
# Concurrent requests = 1000 × 0.05 = 50

# If each request uses 10MB memory:
# Memory = 50 × 10MB = 500MB (minimum)

# CPU: profile under load to find actual usage
```

## Docker Compose (local development)

```yaml
# docker-compose.yml
version: '3.8'

services:
  order-service:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/orders
      - REDIS_URL=redis://cache:6379
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    volumes:
      - ./src:/app/src  # hot reload in development
  
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: orders
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d  # run on first start
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5
  
  cache:
    image: redis:7-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru

volumes:
  postgres_data:
```

## AWS container services

| Service | What it is | Use case |
|---|---|---|
| **ECR** | Container registry | Store and scan images |
| **ECS** | Managed container orchestration | AWS-native, simpler than K8s |
| **EKS** | Managed Kubernetes | K8s portability, larger ecosystems |
| **Fargate** | Serverless containers (ECS/EKS) | No node management |
| **App Runner** | Fully managed container apps | Simplest, for web apps |
| **Lambda** | Serverless with container image support | Event-driven, short tasks |

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you understand containers as a deployment unit and their tradeoffs.

**Strong answer pattern:**
1. Containers = process isolation via namespaces + cgroups, not full VMs
2. Always multi-stage builds — keep production images small (attack surface and cost)
3. Never run as root — `USER 1000` in Dockerfile, `runAsNonRoot` in K8s
4. Always set resource limits — prevent noisy neighbor, enable bin packing
5. Graceful shutdown — handle SIGTERM, drain in-flight requests
6. ECR + ECS/EKS on AWS — managed orchestration, no node management with Fargate

## Related topics

- [Kubernetes](kubernetes.md) — orchestrating containers at scale
- [CI/CD](cicd.md) — building and pushing container images
- [Service Mesh](service-mesh.md) — Envoy sidecar containers
- [Security](../security/api-security.md) — container security hardening
