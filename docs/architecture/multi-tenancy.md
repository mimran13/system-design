---
tags:
  - for-saas
  - applied
---

# Multi-Tenancy

## What it is

Multi-tenancy is an architecture where a single instance of a software application serves multiple customers (tenants), with each tenant's data isolated from the others. The application and infrastructure are shared; the data and experience are separate.

```
Single-tenant (traditional):
  Customer A → their own dedicated server + database
  Customer B → their own dedicated server + database
  
  Isolation: complete. Cost: proportional to customers. Ops: N systems to manage.

Multi-tenant (SaaS):
  Customer A ──┐
  Customer B ──┼──► Shared application servers + database(s)
  Customer C ──┘
  
  Isolation: enforced by software. Cost: sublinear (economies of scale). Ops: one system.
```

---

## The three tenancy models

### Model 1: Silo (database per tenant)

Each tenant gets their own isolated database (or schema). The application routes connections based on tenant identity.

```
Tenant A: postgresql://db-a.internal/app
Tenant B: postgresql://db-b.internal/app
Tenant C: postgresql://db-c.internal/app

Router:
  Request with tenant_id=A → connect to db-a
  Request with tenant_id=B → connect to db-b
```

```python
import threading
from contextlib import contextmanager

# Thread-local storage for current tenant context
_tenant_context = threading.local()

class TenantRouter:
    def __init__(self, tenant_db_map: dict[str, str]):
        # tenant_id → connection string
        self._map = tenant_db_map
        self._connections: dict[str, any] = {}
    
    def set_tenant(self, tenant_id: str):
        _tenant_context.tenant_id = tenant_id
    
    def get_connection(self):
        tenant_id = getattr(_tenant_context, 'tenant_id', None)
        if not tenant_id:
            raise RuntimeError("No tenant context set")
        
        if tenant_id not in self._connections:
            dsn = self._map.get(tenant_id)
            if not dsn:
                raise ValueError(f"Unknown tenant: {tenant_id}")
            self._connections[tenant_id] = create_db_connection(dsn)
        
        return self._connections[tenant_id]

@contextmanager
def tenant_scope(router: TenantRouter, tenant_id: str):
    """Context manager to set tenant for the duration of a request."""
    router.set_tenant(tenant_id)
    try:
        yield
    finally:
        _tenant_context.tenant_id = None
```

**Pros:**
- Complete data isolation — a bug cannot leak data between tenants
- Easy per-tenant customization (different schema versions, extensions)
- Simple compliance (GDPR delete: drop one database)
- Per-tenant backups, restores, and migrations
- Performance isolation: one tenant's heavy queries don't affect others

**Cons:**
- Expensive at scale: 10,000 tenants = 10,000 databases
- Connection pool explosion (one pool per tenant × app servers)
- Schema migrations must run N times
- Onboarding new tenant requires provisioning infrastructure

**Best for:** Enterprise SaaS with large tenants, strict compliance requirements, tenants willing to pay premium for isolation (e.g., healthcare, finance).

---

### Model 2: Bridge (schema per tenant)

One database server, but each tenant gets a separate schema (namespace). Tables are isolated by schema prefix.

```sql
-- PostgreSQL schemas
CREATE SCHEMA tenant_a;
CREATE SCHEMA tenant_b;

-- Each schema gets the same table structure
CREATE TABLE tenant_a.orders (id UUID, total NUMERIC, ...);
CREATE TABLE tenant_b.orders (id UUID, total NUMERIC, ...);

-- Application sets search_path to route queries
SET search_path TO tenant_a;
SELECT * FROM orders;  -- reads from tenant_a.orders
```

```python
class SchemaRouter:
    def set_tenant_schema(self, conn, tenant_id: str):
        schema = f"tenant_{tenant_id}"
        with conn.cursor() as cur:
            # PostgreSQL: set search path for this connection
            cur.execute(f"SET search_path TO {schema}, public")
    
    def provision_tenant(self, tenant_id: str):
        """Create schema and tables for a new tenant."""
        schema = f"tenant_{tenant_id}"
        with self.admin_conn.cursor() as cur:
            cur.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")
            # Run migrations in the new schema
            cur.execute(f"SET search_path TO {schema}")
            self._run_migrations(cur)
```

**Pros:**
- Better isolation than shared tables (SQL injection in one schema can't reach another)
- Easier per-tenant migration (migrate one schema at a time)
- Single DB server to manage

**Cons:**
- One DB server is still a single point of scaling
- Schema proliferation: 10,000 tenants = 10,000 schemas → slow introspection, metadata bloat
- Still must run migrations N times

**Best for:** Mid-size SaaS with moderate tenant count (hundreds to low thousands), needing better isolation than row-level security but not full database separation.

---

### Model 3: Pool (shared tables, row-level isolation)

All tenants share the same tables. Every row has a `tenant_id` column. Isolation enforced by application code or database row-level security (RLS).

```sql
-- Shared table with tenant_id column
CREATE TABLE orders (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL,      -- every table has this
    total       NUMERIC NOT NULL,
    status      VARCHAR(20),
    created_at  TIMESTAMP
);

-- Index tenant_id on every table (critical for performance)
CREATE INDEX idx_orders_tenant ON orders(tenant_id, created_at DESC);

-- PostgreSQL Row Level Security (database-enforced isolation)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
-- Now queries automatically filter to current tenant — even if app forgets WHERE clause
```

```python
class TenantAwareRepository:
    def __init__(self, db):
        self.db = db
    
    def find_orders(self, tenant_id: str, status: str = None) -> list:
        # Application-level: always include tenant_id in WHERE clause
        query = "SELECT * FROM orders WHERE tenant_id = %s"
        params = [tenant_id]
        
        if status:
            query += " AND status = %s"
            params.append(status)
        
        return self.db.query(query, params)
    
    def create_order(self, tenant_id: str, data: dict) -> dict:
        # Always inject tenant_id — never trust client to provide it
        return self.db.execute(
            "INSERT INTO orders (id, tenant_id, total, status) VALUES (%s, %s, %s, %s)",
            (generate_id(), tenant_id, data['total'], 'pending')
        )
```

**Pros:**
- Single schema — one migration runs once
- Most cost-efficient (shared compute and storage)
- Simple operations
- Easy cross-tenant analytics (same tables)

**Cons:**
- Data leakage risk if `tenant_id` filter is forgotten (defense: use RLS)
- "Noisy neighbour" problem — one tenant's heavy query affects all
- Compliance complexity (GDPR: hard to guarantee complete deletion without touching shared tables)
- All tenants on same schema version (can't customize per tenant)

**Best for:** B2C SaaS, high-tenant-count products, startups, where tenants are small and compliance requirements are lightweight.

---

## Choosing the right model

```
                    Tenant count
                Low (<100)    Medium (100s)    High (1000s+)
               ┌───────────┬───────────────┬───────────────────┐
Compliance     │           │               │                   │
High           │   Silo    │     Silo      │  Silo + pooling   │
(healthcare,   │           │               │  for small tenants│
finance)       │           │               │                   │
               ├───────────┼───────────────┼───────────────────┤
Compliance     │           │               │                   │
Medium         │   Silo    │    Bridge     │  Bridge or Pool   │
               │           │               │                   │
               ├───────────┼───────────────┼───────────────────┤
Compliance     │           │               │                   │
Low            │   Bridge  │     Pool      │      Pool         │
(typical SaaS) │           │               │                   │
               └───────────┴───────────────┴───────────────────┘
```

**Hybrid approach (common in practice):**
- Enterprise tier → silo (dedicated DB)
- Professional tier → bridge (dedicated schema)
- Starter/free tier → pool (shared tables)

---

## Tenant context propagation

Tenant identity must flow through every layer of the system:

```python
# FastAPI middleware: extract tenant from JWT, set in request state
from fastapi import FastAPI, Request
import jwt

app = FastAPI()

@app.middleware("http")
async def tenant_middleware(request: Request, call_next):
    # Extract tenant from JWT claim
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            request.state.tenant_id = payload.get("tenant_id")
        except jwt.InvalidTokenError:
            pass
    
    response = await call_next(request)
    return response


# In service layer: always pass tenant_id explicitly
class OrderService:
    def get_orders(self, tenant_id: str, user_id: str) -> list:
        # tenant_id is always an explicit parameter — never a global
        return self.repo.find_orders(tenant_id=tenant_id, user_id=user_id)


# In async workers: propagate tenant via message headers
async def process_order_event(message: dict):
    tenant_id = message['headers']['tenant_id']  # always in event headers
    order_id = message['data']['order_id']
    
    with tenant_scope(tenant_id):
        await order_service.process(tenant_id, order_id)
```

**Rule:** tenant_id must be an explicit parameter or extracted from a verified token — never passed by the client as a plain request body field (that's a data breach waiting to happen).

---

## Rate limiting per tenant

Shared infrastructure means one tenant can starve others. Rate limiting must be tenant-aware:

```python
import redis

class TenantRateLimiter:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        
        # Tier-based limits
        self.LIMITS = {
            'enterprise': 10_000,  # req/min
            'professional': 1_000,
            'starter': 100,
        }
    
    def is_allowed(self, tenant_id: str, tenant_tier: str) -> bool:
        limit = self.LIMITS.get(tenant_tier, 100)
        key = f"rate:{tenant_id}:{int(time.time() // 60)}"  # per-minute window
        
        count = self.redis.incr(key)
        if count == 1:
            self.redis.expire(key, 120)  # 2-minute expiry
        
        return count <= limit
    
    def get_remaining(self, tenant_id: str, tenant_tier: str) -> int:
        limit = self.LIMITS.get(tenant_tier, 100)
        key = f"rate:{tenant_id}:{int(time.time() // 60)}"
        current = int(self.redis.get(key) or 0)
        return max(0, limit - current)
```

---

## Noisy neighbour mitigation

In a pooled model, one tenant running expensive queries degrades everyone:

```
Mitigations:

1. Query timeout per tenant:
   SET statement_timeout = '5000ms';  -- 5 second max per query
   (Set per connection based on tenant tier)

2. Connection pool per tenant tier:
   Enterprise tier: up to 20 connections
   Starter tier: up to 2 connections
   (Prevents one tenant from exhausting the pool)

3. Read replica routing for analytics:
   Heavy reports → read replica
   Transactional queries → primary
   (Analytics can't starve OLTP)

4. Resource tagging + monitoring:
   Track slow queries by tenant_id
   Alert when one tenant exceeds 10% of DB CPU
   Proactively contact or throttle before it becomes an outage

5. Dedicated infrastructure for whales:
   If tenant X consistently drives >30% of load → offer/require silo tier
```

---

## Tenant onboarding and offboarding

```python
class TenantLifecycleService:
    def provision(self, tenant_id: str, tier: str) -> None:
        """Create all resources for a new tenant."""
        if tier == 'enterprise':
            # Provision dedicated database
            self.db_provisioner.create_database(tenant_id)
            self.dns_manager.register(f"{tenant_id}.db.internal")
        elif tier == 'professional':
            # Create schema in shared DB
            self.schema_manager.create_schema(f"tenant_{tenant_id}")
            self.migration_runner.run(schema=f"tenant_{tenant_id}")
        else:
            # Pool model: just register tenant, rows auto-scoped
            pass
        
        # Always: create tenant record, API keys, initial admin user
        self.tenant_registry.create(tenant_id, tier)
        self.auth_service.create_admin(tenant_id)
    
    def deprovision(self, tenant_id: str) -> None:
        """GDPR-compliant tenant deletion."""
        # 1. Disable access immediately
        self.tenant_registry.disable(tenant_id)
        
        # 2. Export data for customer
        self.data_exporter.export_to_s3(tenant_id)
        
        # 3. Queue deletion job (don't do synchronously — could be huge)
        self.deletion_queue.enqueue({
            'tenant_id': tenant_id,
            'scheduled_at': datetime.utcnow() + timedelta(days=30),
            # 30-day grace period in case of dispute
        })
    
    def execute_deletion(self, tenant_id: str) -> None:
        """Called 30 days after deprovision."""
        # Delete from all tables (pool model: DELETE WHERE tenant_id = X)
        for table in self.schema_inspector.all_tables():
            self.db.execute(f"DELETE FROM {table} WHERE tenant_id = %s", (tenant_id,))
        
        # Rotate any encryption keys for this tenant
        self.key_manager.destroy(tenant_id)
```

---

## AWS architecture for multi-tenant SaaS

```
Request: User from Tenant A
    │
    ▼
API Gateway
  Extract tenant_id from JWT
  Add X-Tenant-ID header to downstream requests
    │
    ├─ Enterprise tenants ──────────────────────────────────────────
    │   Dedicated ECS service per tenant (optional)
    │   OR shared ECS + dedicated RDS instance per tenant
    │   Route: api.tenanta.company.com → tenant A's resources
    │
    └─ SMB/Starter tenants ─────────────────────────────────────────
        Shared ECS services (all tenants)
        Shared Aurora PostgreSQL (pooled model)
        Row-level security enforced by PostgreSQL RLS
        ElastiCache: tenant-scoped keys ("cache:{tenant_id}:{key}")
        S3: tenant-prefixed paths ("s3://bucket/{tenant_id}/files/")

Cross-cutting:
  - CloudWatch: filter log streams by tenant_id
  - X-Ray: tag traces with tenant_id for per-tenant latency analysis
  - Cost allocation tags: tag resources with tenant_id for billing
```

---

## Interview talking points

!!! tip "Key things to say"
    1. Three models: silo (DB per tenant — max isolation, expensive), bridge (schema per tenant — middle ground), pool (shared tables + tenant_id column — cheapest, most risk). Most SaaS companies use pool for small tenants and silo for enterprise
    2. Row-level security (RLS) in PostgreSQL is the safety net for pool model — even if application code forgets the WHERE tenant_id clause, the DB enforces it. Always use both app-level filtering AND RLS
    3. Tenant context must propagate explicitly — through HTTP headers (from JWT), through event/message headers in async flows, through explicit function parameters in service code. Never from a global
    4. Noisy neighbour is the core operational problem in pooled multi-tenancy — one tenant's heavy query degrades all others. Mitigations: per-tenant connection limits, query timeouts, routing analytics to read replicas, monitoring tenant-level DB CPU
    5. Compliance asymmetry: GDPR deletion is trivial in silo model (drop the database), hard in pool model (DELETE WHERE tenant_id across dozens of tables, including audit logs, soft-deleted records, backups)

## Related topics

- [Sharding](../patterns/sharding.md) — tenant_id is often the natural shard key
- [Rate Limiting](../patterns/rate-limiting.md) — per-tenant rate limits
- [Security: AuthN & AuthZ](../security/authn-authz.md) — extracting tenant from JWT
- [Connection Pooling](../patterns/connection-pooling.md) — per-tenant connection limits in pooled model
- [Domain-Driven Design](ddd.md) — tenant as a bounded context, service boundaries
