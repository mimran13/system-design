# Twelve-Factor App

## What it is

The Twelve-Factor App is a methodology for building software-as-a-service apps that are portable, scalable, and maintainable. Coined by Heroku engineers in 2011. It describes best practices for cloud-native application development.

These principles are now the baseline assumption for containerized, cloud-native applications.

---

## I. Codebase

**One codebase tracked in version control, many deploys.**

```
✅ One repo → deploy to dev, staging, prod
❌ Separate repos per environment
❌ Different code in different environments
```

Multiple services → multiple codebases (one per service). They share code via libraries (packages), not by merging codebases.

---

## II. Dependencies

**Explicitly declare and isolate dependencies.**

```
✅ requirements.txt, package.json, go.mod, pom.xml
✅ Virtual environments, containers
❌ "It works because the server has X installed"
❌ Relying on system-installed libraries
```

The app should declare all its dependencies and never rely on implicit system-level tools.

---

## III. Config

**Store config in the environment, not in code.**

Config = anything that varies between deploys (dev/staging/prod):
- Database URLs, passwords, API keys
- External service URLs
- Feature flags per environment

```python
# ✅ Correct: from environment
import os
DB_URL = os.environ['DATABASE_URL']
STRIPE_KEY = os.environ['STRIPE_SECRET_KEY']

# ❌ Wrong: hardcoded or in committed config files
DB_URL = "postgresql://user:password@prod-db/myapp"
STRIPE_KEY = "sk_live_abc123..."
```

**No secrets in code or git.** Environment variables or secrets management (AWS Secrets Manager, Vault).

---

## IV. Backing Services

**Treat backing services as attached resources.**

Backing services: databases, caches, queues, email — anything accessed over the network.

```
✅ DB connection from env var → swap from local to RDS by changing env var
❌ Hardcoded connection to specific server
```

Local MySQL and RDS MySQL are interchangeable — just a URL change. No code change.

This is why containerized apps work the same locally as in production.

---

## V. Build, Release, Run

**Strictly separate build, release, and run stages.**

```
Build:   Code + Dependencies → Artifact (Docker image, JAR)
Release: Artifact + Config → Release (tagged, versioned)
Run:     Start release in execution environment

Git commit → CI builds image → CD releases with env config → containers run

✅ Releases are immutable — you can roll back to release v42
❌ "I'll just patch the running server"
❌ Different code in prod than in the build artifact
```

---

## VI. Processes

**Execute the app as one or more stateless processes.**

```
✅ Session data in Redis (external)
✅ Uploaded files in S3 (external)
✅ Any process can handle any request (stateless)

❌ Local file system for persistent data (lost on process restart)
❌ In-memory session state (breaks when load balancer routes to different instance)
❌ Sticky sessions as a workaround for state
```

Stateless processes can be:
- Freely killed and restarted
- Scaled horizontally without coordination
- Deployed to any server

---

## VII. Port Binding

**Export services via port binding.**

The app is self-contained and exposes its service by binding to a port:

```
Flask: app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
Node: server.listen(process.env.PORT || 3000)

No app server required — the app IS the server
Works behind a reverse proxy (Nginx, ALB)
```

This is why containerization works — each container binds its own port.

---

## VIII. Concurrency

**Scale out via the process model.**

```
Web process: handle HTTP requests (scale by adding instances)
Worker process: process queue messages (scale independently)
Clock process: scheduled jobs (typically 1 instance)

docker run -e PROCESS_TYPE=web myapp  → 10 instances
docker run -e PROCESS_TYPE=worker myapp → 3 instances
```

Don't use daemon processes or PID files — rely on the process manager (Kubernetes, ECS, systemd).

---

## IX. Disposability

**Maximize robustness with fast startup and graceful shutdown.**

```
Fast startup (< 5 seconds):
  Don't do expensive initialization at startup
  Load config lazily if possible

Graceful shutdown:
  1. Stop accepting new requests (SIGTERM received)
  2. Finish in-flight requests (drain period)
  3. Release resources (DB connections, locks)
  4. Exit cleanly

For workers:
  Return job to queue on SIGTERM
  Never lose work in progress
```

Why: Kubernetes terminates pods frequently (deploys, scaling). Your app must handle this gracefully.

---

## X. Dev/Prod Parity

**Keep development, staging, and production as similar as possible.**

Common gaps that cause "works on my machine":

| Gap | Problem | Solution |
|---|---|---|
| Time gap | Weeks between dev and deploy | Continuous deployment |
| Personnel gap | Dev writes, ops deploys | DevOps culture |
| Tools gap | SQLite in dev, Postgres in prod | Same backing services everywhere |

```yaml
# docker-compose.yml — use same DB as production
services:
  db:
    image: postgres:15  # Same version as RDS
  redis:
    image: redis:7      # Same version as ElastiCache
  app:
    build: .
```

Use the same backing service type (not SQLite vs Postgres — use Postgres everywhere).

---

## XI. Logs

**Treat logs as event streams.**

```
✅ Write logs to stdout (unbuffered)
✅ Let the execution environment capture, route, and store them
   → Docker: stdout captured by log driver
   → Kubernetes: kubectl logs reads from stdout
   → CloudWatch: captures stdout from ECS tasks

❌ Log to files that you manage
❌ Manage log rotation yourself
❌ Log directly to Elasticsearch from the app
```

The app doesn't know or care where logs go. The platform routes them to log aggregators (CloudWatch, Datadog, ELK stack).

---

## XII. Admin Processes

**Run admin/management tasks as one-off processes.**

```
Database migrations:
  kubectl exec deployment/app -- python manage.py migrate

One-off scripts:
  kubectl run --restart=Never --image=myapp admin-task -- python scripts/backfill.py

Console/REPL:
  kubectl exec -it deployment/app -- python manage.py shell
```

Run in identical environment as the app. Use the same codebase and release. Don't SSH into production and run ad-hoc commands.

---

## Summary

| Factor | Key principle |
|---|---|
| I. Codebase | One repo, many deploys |
| II. Dependencies | Explicitly declared |
| III. Config | In environment variables |
| IV. Backing Services | Attached resources, swappable by URL |
| V. Build/Release/Run | Strict stage separation |
| VI. Processes | Stateless |
| VII. Port Binding | Self-contained |
| VIII. Concurrency | Scale via process model |
| IX. Disposability | Fast startup, graceful shutdown |
| X. Dev/Prod Parity | Same environment everywhere |
| XI. Logs | Streams to stdout |
| XII. Admin Processes | One-off commands |

## Interview angle

!!! tip "When twelve-factor comes up"
    Usually implicit rather than explicit — you demonstrate these principles in your architecture choices.

**Key points to apply:**
1. Never hard-code config — env vars or Secrets Manager
2. Stateless services — session in Redis, uploads in S3
3. Graceful shutdown — critical for Kubernetes deployments
4. Logs to stdout — let the platform aggregate
5. Dev/prod parity — Docker Compose with same services as production

## Related topics

- [Containers & Docker](../infrastructure/containers.md) — natural implementation of twelve-factor
- [Kubernetes](../infrastructure/kubernetes.md) — twelve-factor apps work perfectly in Kubernetes
- [Hexagonal Architecture](hexagonal.md) — code structure that enables twelve-factor
- [Infrastructure as Code](../iac/index.md) — manage environments consistently
