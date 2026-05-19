---
tags:
  - applied
---

# The Modern Data Stack

The set of tools and patterns that emerged in 2018-2024 for analytics, data pipelines, and analytics engineering. Distinct from Lambda/Kappa (which are about real-time vs batch) — this is about **how analytics actually gets done** at companies in 2026.

For *streaming/event architecture*, see [Event Streaming](../messaging/event-streaming.md) and [Lambda & Kappa](../architecture/lambda-kappa-architectures.md). This page is about **batch and analytics-engineering** specifically.

---

## What "modern data stack" means

Before ~2017:

```
ETL with Informatica or hand-rolled Python
Warehouse: Oracle / Teradata / hand-tuned Postgres
BI: Tableau / Power BI
Pipelines: cron + shell scripts
Schema: in DBA's head
Iteration: slow (DBA bottleneck)
```

The "modern data stack" replaced this with:

```
ELT: load raw; transform in warehouse
Warehouse: cloud (Snowflake / BigQuery / Databricks / Redshift)
Transform: dbt
Orchestration: Airflow / Dagster / Prefect / Temporal
BI: Looker / Mode / Sigma / Hex / Metabase
Reverse ETL: Hightouch / Census (send warehouse data back to operational systems)
Data quality: Great Expectations / Soda / dbt tests
Catalog: dbt docs + Atlan / Alation / DataHub / OpenMetadata
Iteration: fast (analysts can self-serve)
```

The key shift: **transformations happen in the warehouse, in SQL, by analysts** — not in Python scripts by engineers.

---

## The warehouse layer

Cloud data warehouses replaced traditional data infrastructure.

### Comparison

| Warehouse | Pricing model | Best for |
|---|---|---|
| **Snowflake** | Per-second compute + storage | Most flexible; great UX; expensive at scale |
| **BigQuery** | Per query (bytes scanned) or capacity | GCP-native; serverless; pay-per-use |
| **Databricks** | Per-second compute; integrated Spark | ML-heavy; lakehouse; complex |
| **Redshift** | Per-cluster compute + storage | AWS-native; RA3 / Serverless options |
| **ClickHouse** | OSS / cloud | High-volume analytics; column store |
| **DuckDB** | Local / embedded | Small-to-medium; serverless analytics |

### Architectural pattern: lakehouse

```
Source data → S3 (raw, parquet)
                  ↓
           Iceberg / Delta / Hudi (table format with metadata)
                  ↓
      Multiple engines can query:
        - Snowflake (external tables)
        - Athena / Trino
        - BigQuery (external)
        - Spark / Databricks
        - DuckDB
```

The **table format** (Iceberg, Delta Lake, Hudi) gives you database-like semantics on top of S3 files: schema evolution, ACID, time travel, partition evolution.

This is **the dominant 2026 pattern**: storage decoupled from compute, multiple engines on the same data.

### Why this matters

```
Old: each warehouse has its own storage; data duplicated
New: one copy in S3; query from anywhere

Vendor lock-in: much lower (Iceberg is open)
Cost: cheaper (S3 vs proprietary storage)
Flexibility: switch query engines as needs change
```

---

## dbt — the transformation layer

dbt (data build tool) became the de facto standard for analytics engineering.

### The model

```
You write SQL: SELECT statements that define datasets
dbt: 
  - Manages dependencies between SQL files
  - Runs them in the right order
  - Materialises as tables / views in the warehouse
  - Tests data quality
  - Generates documentation
```

### Example dbt project

```sql
-- models/staging/stg_orders.sql
SELECT
  order_id,
  user_id,
  total_cents,
  created_at
FROM {{ source('raw', 'orders') }}
WHERE status != 'deleted'
```

```sql
-- models/marts/fct_daily_revenue.sql
SELECT
  DATE(created_at) AS date,
  SUM(total_cents) / 100.0 AS revenue
FROM {{ ref('stg_orders') }}
GROUP BY 1
```

```yaml
# tests
models:
  - name: stg_orders
    columns:
      - name: order_id
        tests: [unique, not_null]
      - name: user_id
        tests: [not_null]
```

dbt handles:
- Dependency graph (DAG): `stg_orders` runs before `fct_daily_revenue`
- Tests: unique, not_null, custom SQL tests
- Documentation: auto-generated from `description` fields
- Materialisation: view, table, incremental, snapshot

### Why dbt won

```
Before dbt:
  - Transforms in Python (Airflow tasks)
  - Hard for analysts to contribute
  - No standard structure
  - Documentation drift
  
With dbt:
  - SQL (analysts can write)
  - Standard project structure
  - Tests are first-class
  - Lineage / docs free
  - Git-based workflow (PRs for analytics)
```

The cultural shift: **analytics engineering became a discipline** between engineers and analysts.

### dbt Cloud vs Core

```
dbt Core:    OSS; you run it
dbt Cloud:   managed; web IDE; scheduler; semantic layer
```

Most production teams use both: dbt Core in CI/CD; dbt Cloud for scheduling and collaboration.

---

## Orchestration

Pipelines need orchestrators — tools that run jobs in order, on schedule, with retries and observability.

### Airflow — the incumbent

```
Pros:
  Mature; huge community; tons of integrations
  Python-based DAGs
  Powerful and flexible

Cons:
  Steep learning curve
  Stateful operations (XCom) get awkward
  Heavy infrastructure
```

### Dagster — modern alternative

```
Pros:
  Asset-based (focused on data outputs, not just tasks)
  Excellent typing and testing support
  Better local development experience
  
Cons:
  Smaller community than Airflow
  Newer; less battle-tested at largest scale
```

### Prefect — also modern

```
Pros:
  Python-first; light Pythonic API
  Hybrid execution (Prefect cloud + your infra)
  Good for newer teams

Cons:
  Less mature than Airflow
```

### Temporal — workflow engine (different category)

```
Not strictly a data orchestrator; built for application workflows.
Increasingly used for data pipelines that need durable execution
across days/weeks.

Best for: long-running orchestrations with complex state, retries, compensation.
```

### When you don't need an orchestrator

For simple cases:
- **cron + shell scripts**: 5-10 jobs; tolerable failure modes
- **dbt Cloud scheduler**: if everything is dbt
- **AWS Step Functions**: if you're all-AWS

Don't bring Airflow in until you actually need DAGs of 20+ tasks. The operational overhead is real.

---

## Data ingestion

How does raw data get into the warehouse?

### Options

| Method | Tools | Notes |
|---|---|---|
| **CDC** | Debezium, AWS DMS, Fivetran | Change-data-capture from operational DBs |
| **API pull** | Fivetran, Airbyte, Stitch | Sync SaaS data sources (Salesforce, Stripe, etc.) |
| **Event streams** | Kafka → S3 sink | Real-time events |
| **Custom Python** | Anything | Last resort |

### Fivetran / Airbyte / Stitch

Managed data ingestion. You pick sources; they handle pipelines.

```
Pros:
  Hundreds of pre-built connectors
  Schema evolution handled
  Incremental sync
  Less engineering work

Cons:
  Expensive at high volume
  Vendor lock-in
  Less control over edge cases
```

For analytics: usually worth it. Engineering time to build/maintain connectors > license cost.

For operational data: CDC directly (Debezium → Kafka → warehouse sink) is more flexible.

### CDC from operational databases

```mermaid
graph LR
    A[Postgres / MySQL] -->|WAL/binlog| B[Debezium]
    B --> C[Kafka]
    C --> D[Sink connector]
    D --> E[Warehouse]
    
    style B fill:#fff4e1
```

Used at scale to keep warehouse in near-real-time sync with operational data.

---

## Reverse ETL

The newest layer: **send data FROM the warehouse BACK to operational systems**.

```
Forward ETL:  app → warehouse (analyse data)
Reverse ETL:  warehouse → app / SaaS (operationalise insights)
```

### Use cases

```
"Salesforce should show LTV for each account"
  → calculate LTV in warehouse → push to Salesforce daily

"Marketing automation should know which users are high-engagement"
  → segment in warehouse → push to Braze / Customer.io

"Customer success should see usage trends"
  → aggregate in warehouse → push to Salesforce / Gainsight

"Personalisation engine needs latest user features"
  → compute features in warehouse → push to feature store / Redis
```

### Tools

```
Hightouch, Census:  the two leaders; manage syncs warehouse → SaaS
Polytomic, RudderStack: alternatives
DIY:                possible but tedious (one-off jobs per destination)
```

This category emerged ~2020. Pretty mainstream by 2026.

---

## Data quality

A real discipline now, not an afterthought.

### Layers of data quality

```
1. Schema validation:    column exists; type correct
2. Constraint checks:    unique IDs; not null
3. Statistical:          row count in range; distribution similar to historical
4. Business logic:       revenue should match sum of orders; cohort retention monotonic
5. End-to-end:           data flowing fresh; sub-X-hour lag
```

### Tools

```
dbt tests:           built-in; for warehouse-level checks
Great Expectations:  more flexible; Python-based
Soda:                similar; SaaS option
Monte Carlo:         observability; lineage + anomaly detection
Datafold:            data diff; column-level change detection
Acceldata, BigEye:   data observability platforms
```

### Practical patterns

```
Tier 1 (critical) tests: block pipeline on failure
Tier 2 (warning) tests: alert; continue
Tier 3 (informational): track over time

Schema tests (cheap): run on every PR
Data tests (expensive): run nightly
```

### Data contracts

The newest pattern: **producer commits to a schema**; downstream consumers can rely.

```yaml
# Schema for orders.placed events
schema_version: 2.1
breaking_changes_require_review: true
sla:
  freshness: "< 5 minutes"
  completeness: "> 99.5%"
owner: orders-team
consumers:
  - analytics-team
  - finance-team
```

Producers can't break the contract without breaking dependents. Enforced via CI: schema PRs require consumer approval.

Tools: Buf for Protobuf; Apache Iceberg for table-level; custom YAML schemas for events.

---

## Data catalog

At scale, you need a registry of "what data exists, what does it mean, who owns it."

### What it tracks

```
Per dataset:
  Name + description
  Owning team
  Schema
  Lineage (where it came from; what depends on it)
  SLA (freshness, quality)
  Sample data
  Documentation
```

### Tools

```
dbt docs:        free with dbt; basic but covers most needs
Atlan, Alation:  commercial; rich features
DataHub:         LinkedIn's; OSS
OpenMetadata:    OSS; modern
Castor:          startup; modern UX
Select Star:     simpler offering
```

For early-stage: dbt docs is enough. For 50+ datasets: dedicated tool justified.

---

## The semantic layer

A long-promised vision: define metrics ONCE in a canonical place; consume from any BI tool.

```
Without semantic layer:
  Each BI tool has its own "revenue" definition
  Discrepancies between dashboards
  Re-implementation of business logic per tool

With semantic layer:
  Define "revenue" once (with caveats and dimensions)
  All consumers query through the layer
  Single source of truth
```

### Tools

```
dbt Semantic Layer (formerly Transform / MetricFlow): part of dbt Cloud
Cube.js:        open-source
Looker:         classic implementation (LookML)
Malloy:         Google's semantic data language
```

This area is still evolving. Worth following but not yet "must adopt."

---

## BI and visualisation

The end of the pipeline: dashboards and analysis.

### Tools

| Tool | Best for | Cost |
|---|---|---|
| **Looker** | Enterprise; powerful LookML modeling | $$$ |
| **Tableau** | Best charts; complex visualisations | $$$ |
| **Mode** | Analyst-focused; SQL + Python | $$ |
| **Hex** | Notebook + dashboard hybrid | $$ |
| **Sigma** | Excel-like; spreadsheet users | $$$ |
| **Metabase** | Open-source; self-hosted | $ |
| **Superset** | Open-source; powerful | $ |
| **Lightdash** | Open-source; dbt-aware | $ |
| **Preset** | Managed Superset | $$ |
| **Power BI** | Microsoft shops | $$ |

For startups: Metabase / Lightdash often sufficient.
For mid-stage: Mode / Hex.
For enterprise: Looker / Tableau / Hex.

### Embedded analytics

```
Need: show dashboards to your customers in your product
Tools: Sigma, Hex, Mode, Metabase (some)
       Or: custom built on dbt models + charting library
```

---

## Streaming + batch hybrid

Pure streaming for everything is overkill. Pure batch is too slow. The pattern:

```
Streaming (Flink / Kafka Streams):
  Real-time aggregations for dashboards
  Sub-minute alerts
  Operational systems

Batch (dbt nightly):
  Complex analytics
  Historical reprocessing
  Reports
  
Both produce data; some consumers use both
```

### Materialise / RisingWave — streaming SQL

```
Materialise:    streaming SQL; materialised views always fresh
RisingWave:    similar; open-source

Use case: real-time analytics with SQL semantics
Trade-off: cost; complexity vs batch dbt
```

Reasonable adoption for specific use cases (real-time leaderboards, fraud detection, live dashboards).

---

## Data team structure

How analytics is organised matters as much as tools.

### Centralised data team

```
One team owns warehouse + dbt + dashboards.
Stakeholders submit requests.

Pros: consistency; expertise concentrated
Cons: bottleneck; out of touch with domains
```

### Embedded analysts

```
Each product team has an analyst.
Central data platform team owns infrastructure.

Pros: domain knowledge; fast iteration
Cons: divergent practices; harder to share work
```

### Federated (modern default)

```
Central platform team: warehouse, infrastructure, governance
Domain teams: own their dbt models, dashboards, datasets

Like data mesh.
```

See [Data Mesh](../architecture/data-mesh.md).

---

## Cost optimisation in data stacks

```
Snowflake / BigQuery costs scale with usage.
Easy to spend $100K/month without realising.

Patterns:
  - Auto-suspend warehouses after idle
  - Right-size compute by workload
  - Materialise expensive queries (don't recompute)
  - Partition / cluster appropriately
  - Cache common queries
  - Cap query cost via timeout/byte limits
  - Reserve capacity for predictable baseline
```

For Snowflake specifically: **multi-cluster warehouses with auto-suspend** keeps costs reasonable. Without auto-suspend, idle warehouses burn money.

---

## Architectural patterns

### Pattern 1: Modern data stack baseline

```
Operational DB → Fivetran/Debezium → Snowflake/BigQuery
                                          ↓
                                      dbt models (staging, marts)
                                          ↓
                                      BI dashboards (Mode/Looker)
                                          ↓
                                      Reverse ETL (Hightouch) → SaaS
```

This works for most companies up to $100M+ ARR.

### Pattern 2: With real-time

```
Operational events → Kafka → Flink (streaming agg) → Redis / Materialize
                       ↓
                       S3 (raw events)
                       ↓
                  dbt incremental (warehouse)
                       ↓
                  BI / Reverse ETL
```

Real-time and batch coexist; consumers pick the right source.

### Pattern 3: ML-heavy

```
Raw → S3 / Lakehouse
         ↓
   Feature engineering (Spark / dbt)
         ↓
   Feature store (Feast / Tecton)
         ↓
   Model serving (online inference)
         +
   Training pipelines (Spark / Airflow)
```

See [ML in Production beyond LLMs](../ai/ml-in-production.md).

---

## Anti-patterns

| Anti-pattern | Better |
|---|---|
| Python ETL for everything | SQL + dbt for transformations |
| One giant dbt model with all logic | Layered models (staging, intermediate, marts) |
| No tests in dbt | At minimum: unique, not_null on PKs/FKs |
| BI tool directly reading from operational DB | Warehouse + appropriate refresh |
| Snowflake without auto-suspend | $$$$ waste |
| Reverse ETL by hand-coded scripts | Hightouch / Census |
| No data catalogue at 50+ tables | dbt docs minimum; tool at scale |
| Multiple warehouses with overlapping data | Single source of truth; one warehouse |
| Real-time everything | Real-time where needed; batch otherwise |

---

## Quick reference

```
"Starting modern data stack"            Snowflake/BigQuery + dbt + Fivetran + Metabase
"Real-time analytics"                   Materialise or Flink + Redis; supplement batch
"Send analytics back to operational"    Hightouch / Census (reverse ETL)
"Data quality issues"                   dbt tests + Great Expectations + Monte Carlo
"Multiple BI tools, conflicting metrics" Semantic layer (dbt SL, Cube, Looker LookML)
"Hugely expensive warehouse bills"      Auto-suspend; materialise; query caps; reserved
"Streaming SQL"                          Materialise, RisingWave (cost vs simplicity)
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you know analytics is its own engineering discipline now — not "DBA work."

**Strong answer pattern:**
1. Cloud warehouse (Snowflake/BigQuery) + dbt for transforms
2. Lakehouse with Iceberg/Delta when scale + cost matter
3. CDC from operational DBs; Fivetran/Airbyte for SaaS sources
4. Reverse ETL operationalises insights (warehouse → CRM)
5. Data quality first-class (dbt tests, Great Expectations)
6. Real-time + batch hybrid; not one or the other

**Common follow-up:** *"Your company is hiring its first data engineer. What stack would you recommend?"*
> Snowflake or BigQuery as the warehouse — Snowflake if you want best UX and flexibility; BigQuery if you're GCP-native or want pay-per-query simplicity. dbt for all transformations (analysts can contribute SQL; engineers handle infrastructure). Fivetran for SaaS ingestion (Salesforce, Stripe, etc.) and Debezium → Kafka → Snowflake sink for operational DB CDC. Mode or Metabase for BI initially; Looker if budget supports it. Hightouch for reverse ETL when needed (likely year 2). Total cost for early-stage: ~$5-15K/month. Skip Airflow until you actually have orchestration needs beyond dbt Cloud scheduler — usually year 2+.

---

## Related

- [Data Warehousing](data-warehousing.md) — warehouse concepts
- [Data Mesh](../architecture/data-mesh.md) — organisational pattern
- [Lambda & Kappa Architectures](../architecture/lambda-kappa-architectures.md) — streaming vs batch
- [Event Streaming](../messaging/event-streaming.md) — Kafka and friends
- [ML in Production beyond LLMs](../ai/ml-in-production.md) — ML data stack
