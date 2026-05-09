# Data Mesh

Data Mesh is an architectural paradigm that applies microservices thinking to data. Instead of centralizing all data in a monolithic data lake or warehouse owned by a single data platform team, Data Mesh distributes data ownership to the domain teams that produce it — treating data as a product.

Coined by Zhamak Dehghani (ThoughtWorks, 2019). Adopted at Netflix, Zalando, Intuit, and others.

---

## The problem with centralized data

The traditional approach: all data flows into a central data lake/warehouse owned by a dedicated data platform team.

```
Domain Teams (Producers)
  Orders Team    ──┐
  Users Team     ──┤──→  Central Data Lake  ←──  Data Platform Team
  Payments Team  ──┤
  Catalog Team   ──┘
                         ↓
                  Data Consumers
                  (analysts, data scientists, ML teams)
```

**What goes wrong at scale:**

| Problem | Description |
|---|---|
| **Pipeline sprawl** | Hundreds of ETL pipelines, hard to understand dependencies |
| **Data platform bottleneck** | Every new dataset requires the central team — backlog grows |
| **Disconnect from domain** | Data platform team doesn't understand Orders domain semantics |
| **Quality degradation** | Domain teams don't own downstream quality — ownership is unclear |
| **Governance lag** | Security, PII, access control is retrofitted |
| **Single point of failure** | Central platform outage affects all consumers |

---

## The four Data Mesh principles

### 1. Domain Ownership

Data is owned and published by the domain team that generates it — the same team that owns the operational system.

```
Orders Team owns:
  - Orders microservice (operational)
  - orders-analytics data product (analytical)
  - Both have the same team's SLAs and documentation

Not:
  - Orders Team produces data
  - Central team transforms and serves it
```

The domain team is responsible for: quality, freshness, schema evolution, access control, and documentation of their data product.

### 2. Data as a Product

Each domain's data output is treated like a product — with an owner, SLA, discoverability, and consumers.

A data product has:

```
┌────────────────────────────────────────────────────┐
│              orders-daily-summary                  │
│                                                    │
│  Owner:        Orders Team                         │
│  SLA:          Available by 06:00 UTC daily        │
│  Freshness:    Updated hourly                      │
│  Schema:       orders_v2.json (versioned)          │
│  Access:       Internal analysts, Finance, ML team │
│  Quality:      >99.5% completeness, 0 duplicates   │
│  Location:     s3://data-mesh/orders/daily/        │
│  Docs:         data-catalog.company.com/orders     │
└────────────────────────────────────────────────────┘
```

Data products have input ports (upstream data they consume), transformation logic, and output ports (what they publish).

```
Input ports:
  orders-events (Kafka topic, owned by Orders service)
  inventory-snapshots (owned by Catalog team)

Transformation:
  Joins, aggregations, quality checks

Output ports:
  orders-daily-parquet (S3, for batch analytics)
  orders-realtime (Kafka, for real-time consumers)
  orders-api (REST API, for ad-hoc queries)
```

### 3. Self-Serve Data Platform

Teams need infrastructure to build and serve data products without requiring the central team for every step. The platform provides:

```
Data Product Infrastructure:
  ├── Storage provisioning (S3 buckets, data warehouse schemas)
  ├── Pipeline templates (pre-built Spark/dbt templates)
  ├── Data catalog integration (auto-register new products)
  ├── Quality monitoring (auto-detect schema drift, completeness)
  ├── Access control (IAM policies, column-level security)
  └── Observability (lineage tracking, freshness monitoring)
```

Teams pick from the platform; the platform team doesn't build every pipeline.

### 4. Federated Computational Governance

Governance is distributed but uses shared standards — each team implements it, a central body sets the rules.

```
Central governance sets:
  - Data classification standards (PII, confidential, public)
  - Schema versioning conventions
  - Retention policies
  - Interoperability standards (common key formats, timestamps)
  - Access request process

Domain teams enforce:
  - PII tagging in their data products
  - Retention in their storage
  - Schema versioning in their products
  - Documenting access restrictions
```

---

## Data Mesh vs Data Lake vs Data Warehouse

| | Data Warehouse | Data Lake | Data Mesh |
|---|---|---|---|
| **Ownership** | Central DWH team | Central data platform | Domain teams |
| **Architecture** | Centralized, structured | Centralized, raw | Federated, distributed |
| **Data model** | Tightly governed schema | Schema-on-read | Per-domain, product SLA |
| **Scalability** | Limited (central bottleneck) | Limited (central bottleneck) | High (decentralized) |
| **Data quality** | Central team responsible | Often poor ("data swamp") | Domain team responsible |
| **Discovery** | Catalog (often stale) | Catalog (often stale) | Self-serve catalog |
| **Best for** | Structured BI reporting | Exploratory, ML | Large org, many domains |

---

## Implementation patterns

### Data Product pattern

```python
# Example: Orders domain data product using dbt + S3 + Kafka

# models/orders/daily_order_summary.sql (dbt model)
WITH orders AS (
    SELECT
        date(created_at) AS order_date,
        customer_id,
        status,
        total_amount,
        COUNT(*) AS order_count,
        SUM(total_amount) AS revenue
    FROM {{ source('orders', 'orders') }}
    WHERE created_at >= DATEADD(day, -90, CURRENT_DATE)
    GROUP BY 1, 2, 3, 4
),
validated AS (
    SELECT *
    FROM orders
    WHERE order_count > 0  -- data quality filter
      AND revenue >= 0     -- sanity check
)
SELECT * FROM validated
```

```yaml
# schema.yml — data product metadata
models:
  - name: daily_order_summary
    description: "Daily aggregated order metrics per customer. SLA: available by 06:00 UTC."
    meta:
      owner: orders-team
      sla: "Available by 06:00 UTC"
      freshness: hourly
      pii: false
      consumers: [finance-team, ml-team, analytics]
    columns:
      - name: order_date
        description: "Date of orders (UTC)"
        tests: [not_null]
      - name: revenue
        description: "Sum of order totals in USD cents"
        tests: [not_null, {dbt_expectations.expect_column_values_to_be_between: {min_value: 0}}]
```

### Data catalog (discovery)

```python
# Auto-register data products in the catalog on deployment
import datahub_sdk

def register_data_product(name: str, metadata: dict):
    client = datahub_sdk.DatahubClient()
    client.emit(DatasetProperties(
        name=name,
        description=metadata["description"],
        customProperties={
            "owner": metadata["owner"],
            "sla": metadata["sla"],
            "consumers": ",".join(metadata["consumers"])
        }
    ))
```

### Cross-domain joins (the hard part)

In a Data Mesh, domains own their data. Cross-domain queries require explicit data product consumption:

```
# BAD: Joining across domain databases directly
SELECT o.*, u.name
FROM orders_db.orders o
JOIN users_db.users u ON o.customer_id = u.id  -- crosses domain boundary

# GOOD: Each domain publishes a data product
-- Orders domain publishes orders-with-customer-segment
-- Which joins with its own consumed copy of user-segments data product
-- Consumers query the orders-with-customer-segment product
```

---

## When Data Mesh makes sense

| Context | Recommendation |
|---|---|
| Small org, 1-2 data teams | Data lake or warehouse — simpler, less overhead |
| Multiple domains with clear ownership | Data Mesh starts making sense |
| Central data team is a bottleneck | Strong signal for Data Mesh |
| Different domains have very different data needs | Data Mesh handles heterogeneity well |
| Need domain experts responsible for data quality | Data Mesh incentive structure helps |
| Strong platform engineering culture | Data Mesh requires platform investment |

**Anti-patterns:**
- Data Mesh without a self-serve platform → each team reinvents the wheel
- Data Mesh without governance → incompatible schemas, PII leakage
- Data Mesh with teams too small to own a product → overhead exceeds benefit

---

## Relationship to other architectural patterns

```
Microservices → inspired Data Mesh (domain ownership, team autonomy)
Event Streaming (Kafka) → often used as the output port between data products
dbt → transforms raw events into curated data products
Data Lakehouse (Delta Lake, Iceberg) → storage layer for data products
Service Mesh → governance inspiration for federated governance
```

---

## Interview angle

!!! tip "Data Mesh in senior system design"
    - *"How would you architect the analytics platform for a large e-commerce company with 20 engineering teams?"* → Data Mesh: domain teams own their data products, self-serve platform for infrastructure, federated governance for standards. Orders team publishes `orders-analytics`, catalog team publishes `product-views`, etc.
    - *"What's wrong with a central data lake?"* → Central bottleneck, domain experts don't own quality, ETL pipeline sprawl, data swamp problem. Data Mesh addresses these by shifting ownership to producers.
    - *"How do you handle cross-domain analytics?"* → Domains publish data products via agreed output ports (Parquet on S3, Kafka topics). Downstream consumers join data products — not source databases. Governance sets interoperability standards (common key formats, timestamps).

## Related topics

- [Event-Driven Architecture](event-driven.md) — Kafka as the backbone for data product output ports
- [Domain-Driven Design](ddd.md) — bounded contexts map directly to data mesh domains
- [Microservices Patterns](microservices-patterns.md) — same decentralization principles
- [Storage: Data Warehousing](../storage/data-warehousing.md) — the centralized alternative
- [Messaging: Kafka](../messaging/kafka.md) — typical output port for real-time data products
