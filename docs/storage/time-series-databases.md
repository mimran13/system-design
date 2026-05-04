# Time-Series Databases

## What it is

A time-series database (TSDB) is optimized for data that is inherently time-stamped and append-only — metrics, sensor readings, financial ticks, IoT data, application performance data. The query patterns are always time-bounded and often involve aggregations over time windows.

## Why a dedicated TSDB?

Regular databases struggle with time-series at scale:

| Problem | How TSDB solves it |
|---|---|
| High ingest rate (millions of points/sec) | Write-optimized storage (append-only, columnar) |
| Massive data volume | Automatic compression (timestamps + values compress extremely well) |
| Time-range queries | Partitioned by time — no full scans |
| Downsampling | Built-in rollups (avg/max/min over time windows) |
| Retention policies | Auto-purge old data without DELETE overhead |

**Compression example:** Regular float: 8 bytes. Delta-of-delta encoded: 1-2 bits. Time-series data can compress 10-20x.

## Core concepts

**Measurement** (InfluxDB) / **Metric** (Prometheus): The name of what you're measuring
```
measurement: cpu_usage
metric: http_request_duration_seconds
```

**Tags** (indexed metadata for filtering):
```
host=web-01, region=us-east-1, service=api
```

**Fields** (values — not indexed):
```
value=72.5, idle=18.2, system=9.3
```

**Timestamp:** Nanosecond precision common

```
# InfluxDB line protocol
cpu_usage,host=web-01,region=us-east-1 value=72.5,idle=18.2 1714137600000000000
```

## InfluxDB

Purpose-built for operational time-series data. Used for infrastructure monitoring, IoT, real-time analytics.

```sql
-- Flux query language (InfluxDB 2.x)
from(bucket: "metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "cpu_usage" and r.host == "web-01")
  |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
  |> yield(name: "mean")
```

**InfluxDB key features:**
- **Continuous queries / tasks:** Pre-aggregate and downsample automatically
- **Retention policies:** Auto-delete data older than N days
- **Telegraf:** Agent for collecting metrics from 200+ sources

## Prometheus

The standard for Kubernetes and microservices monitoring. Pull-based (scrapes metrics from `/metrics` endpoints).

```
# Prometheus metric types
Counter:   http_requests_total{method="GET", status="200"} 12345
           (monotonically increasing — rate() to get per-second)

Gauge:     memory_usage_bytes{host="web-01"} 2147483648
           (current value, can go up or down)

Histogram: http_request_duration_seconds_bucket{le="0.1"} 540
           (distribution of values — percentile calculation)

Summary:   rpc_duration_seconds{quantile="0.95"} 0.023
           (pre-calculated quantiles at client side)
```

**PromQL (Prometheus Query Language):**
```
# Request rate over 5 min
rate(http_requests_total{status="200"}[5m])

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Error rate
rate(http_requests_total{status=~"5.."}[5m]) /
rate(http_requests_total[5m])

# Memory usage alert
memory_usage_bytes / node_memory_total_bytes > 0.90
```

**Prometheus limitations:**
- Not designed for long-term storage (default 15-day retention)
- Not durable — data is local to Prometheus server
- No clustering (single server)

**Long-term storage solutions:** Thanos, Cortex, VictoriaMetrics, Grafana Mimir — add global query, deduplication, and object-store (S3) backed long-term retention.

## Downsampling and retention

Raw metrics are expensive to store long-term. Downsample older data:

```
0-1 days:    raw data (10-second resolution)
1-7 days:    1-minute averages
7-30 days:   5-minute averages
30-365 days: 1-hour averages
1+ years:    1-day averages or delete
```

```sql
-- InfluxDB: downsample task
option task = { name: "downsample-cpu", every: 1h }

from(bucket: "metrics_raw")
  |> range(start: -task.every)
  |> filter(fn: (r) => r._measurement == "cpu_usage")
  |> aggregateWindow(every: 5m, fn: mean)
  |> to(bucket: "metrics_5m")
```

## Time-series patterns

### Rate of change

```
Prometheus: rate(counter[window])
Calculates per-second increase over the window

rate(http_requests_total[5m]) = 250 req/sec
```

### Moving average

```
InfluxDB: movingAverage(n: 10)
Smooth out spikes in noisy data
```

### Anomaly detection

```
Compare current value to N-day average:
value > avg(last 7 days) * 3.0 → anomaly
```

### Seasonal patterns

```
Week-over-week comparison:
current_hour_value vs same_hour_last_week
```

## AWS equivalents

| Service | Notes |
|---|---|
| Amazon Timestream | Fully managed TSDB, serverless, automatic tiering |
| Amazon Managed Service for Prometheus (AMP) | Prometheus-compatible, managed |
| Amazon Managed Grafana (AMG) | Visualization, connects to AMP/Timestream/CloudWatch |
| CloudWatch Metrics | AWS-native metrics (not a TSDB, but time-series capable) |

**Timestream architecture:**
```
Memory store (hot data, last 12h) → Magnetic store (historical, years)
                                                         ↑
                                              Automatic tiering
```

## When to use a TSDB

| Good fit | Use something else |
|---|---|
| Infrastructure metrics (CPU, memory, latency) | General application data |
| IoT sensor data | User profiles, orders, transactions |
| Financial tick data | Social graph |
| Application performance monitoring (APM) | Full-text search → Elasticsearch |
| Time-bounded aggregations | Ad-hoc relational queries → PostgreSQL |

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you recognize when metrics/monitoring data needs a dedicated TSDB and can reason about the write patterns.

**Strong answer pattern:**
1. Identify the data — is it time-stamped, append-only, high ingest rate?
2. State the access pattern — time-range queries with aggregations
3. Choose the tool — Prometheus for operational metrics, InfluxDB/Timestream for IoT/general TSDB
4. Mention downsampling — you can't keep raw data forever at scale
5. Note the observability stack — Prometheus + Grafana is the standard

## Related topics

- [Metrics](../observability/metrics.md) — what to measure and how to structure it
- [Observability](../observability/index.md) — the full observability picture
- [Wide-Column Stores](wide-column-stores.md) — Cassandra is an alternative for time-series at massive scale
- [AWS Observability](../aws/observability.md) — CloudWatch + AMP + AMG on AWS
