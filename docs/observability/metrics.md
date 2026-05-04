# Metrics

## What it is

Metrics are numeric measurements of system behavior aggregated over time. Unlike logs (individual events) or traces (request flows), metrics are pre-aggregated time series — they answer "how many?" and "how fast?" questions at scale with minimal storage cost.

```
Logs:   "Order ord_123 failed at 14:00:01.234" — full detail, expensive to store
Traces: "Request took 245ms: 5ms DB + 230ms payment API" — journey detail
Metrics: "Error rate: 0.1%, p99 latency: 250ms, order rate: 450 rps" — fast summary
```

## The four golden signals

Google SRE's four signals to monitor for any service:

```
1. Latency    — how long requests take
               p50, p95, p99, p999 (percentiles, not averages)
               Distinguish success vs error latency

2. Traffic    — how much demand
               Requests per second, orders per minute, bytes transferred

3. Errors     — rate of failed requests
               HTTP 5xx rate, exception rate, business error rate

4. Saturation — how "full" your service is
               CPU %, memory %, queue depth, connection pool usage
               Leading indicator: system degrades before it fails
```

## Metric types

### Counter

Monotonically increasing value. Resets to zero on restart.

```python
# Prometheus Python client
from prometheus_client import Counter

orders_total = Counter(
    "orders_total",
    "Total number of orders created",
    ["status", "payment_method"]  # labels
)

# Increment
orders_total.labels(status="success", payment_method="card").inc()
orders_total.labels(status="failed", payment_method="card").inc()

# Query (PromQL): rate of successful orders per second
# rate(orders_total{status="success"}[5m])
```

**Use for:** Requests, errors, bytes transferred, events processed.

### Gauge

Point-in-time value. Can go up or down.

```python
from prometheus_client import Gauge

active_connections = Gauge("active_connections", "Current active DB connections")
queue_depth = Gauge("queue_depth", "Messages waiting in queue", ["queue_name"])
memory_usage_bytes = Gauge("memory_usage_bytes", "Current memory usage")

# Set current value
active_connections.set(42)
queue_depth.labels(queue_name="orders").set(150)

# Increment/decrement
active_connections.inc()
active_connections.dec()
```

**Use for:** Current connections, queue depth, memory, active requests, CPU%.

### Histogram

Measures the distribution of values in configurable buckets. Enables percentile calculations.

```python
from prometheus_client import Histogram

request_duration = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint", "status_code"],
    buckets=[.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10]  # seconds
)

import time

def handle_request(method, endpoint):
    start = time.time()
    try:
        result = process_request()
        status = "200"
        return result
    except Exception:
        status = "500"
        raise
    finally:
        duration = time.time() - start
        request_duration.labels(
            method=method,
            endpoint=endpoint,
            status_code=status
        ).observe(duration)

# PromQL: 99th percentile latency
# histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

**Use for:** Request duration, response size, queue wait time. **Never use averages — use histograms.**

### Summary

Similar to histogram but calculates quantiles client-side. Less accurate for distributed systems.

```python
from prometheus_client import Summary

request_duration = Summary(
    "request_duration_seconds",
    "Request duration",
    quantiles=[0.5, 0.9, 0.99]  # pre-computed quantiles
)

# PromQL: no aggregation across instances (not suitable for distributed systems)
# Use Histogram instead for distributed systems
```

**Histogram vs Summary:**
- Histogram: server-side buckets, aggregatable across instances → use in production
- Summary: client-side quantiles, not aggregatable → avoid for distributed systems

## Prometheus

The de facto standard for metrics collection.

### Architecture

```
Application ──scrape──► Prometheus ──query──► Grafana
     │           ↑                               │
     │      /metrics                          dashboards
     │      endpoint                          alerts
     │
  Pushgateway (for batch jobs)
```

### Exposition format

```
# HELP http_request_duration_seconds HTTP request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="POST",endpoint="/orders",status_code="201",le="0.1"} 8423
http_request_duration_seconds_bucket{method="POST",endpoint="/orders",status_code="201",le="0.25"} 9821
http_request_duration_seconds_bucket{method="POST",endpoint="/orders",status_code="201",le="0.5"} 9995
http_request_duration_seconds_bucket{method="POST",endpoint="/orders",status_code="201",le="+Inf"} 10000
http_request_duration_seconds_sum{method="POST",endpoint="/orders",status_code="201"} 1247.3
http_request_duration_seconds_count{method="POST",endpoint="/orders",status_code="201"} 10000

# HELP orders_total Total orders
# TYPE orders_total counter
orders_total{status="success",payment_method="card"} 98234
orders_total{status="failed",payment_method="card"} 823
```

### PromQL essentials

```promql
# Rate: events per second (over 5 minute window)
rate(orders_total{status="success"}[5m])

# Error rate as percentage
100 * rate(http_requests_total{status_code=~"5.."}[5m])
  / rate(http_requests_total[5m])

# P99 latency from histogram
histogram_quantile(0.99, 
  sum(rate(http_request_duration_seconds_bucket[5m])) 
  by (le, endpoint)
)

# Current queue depth
queue_depth{queue_name="orders"}

# CPU usage
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Alert: error rate > 1%
ALERT HighErrorRate
  IF rate(http_requests_total{status_code=~"5.."}[5m])
     / rate(http_requests_total[5m]) > 0.01
  FOR 5m
  LABELS {severity="critical"}
  ANNOTATIONS {
    summary = "High error rate on {{ $labels.service }}"
  }
```

## Instrumentation in code

```python
# FastAPI with auto-instrumentation
from prometheus_fastapi_instrumentator import Instrumentator

app = FastAPI()

# Auto-generates: http_request_duration_seconds, http_requests_total
Instrumentator().instrument(app).expose(app)  # exposes /metrics

# Custom business metrics
from prometheus_client import Counter, Histogram, Gauge

# Business counters
payment_attempts = Counter("payment_attempts_total", "Payment attempts", ["provider", "result"])
order_value_histogram = Histogram(
    "order_value_dollars",
    "Order value distribution",
    buckets=[1, 5, 10, 25, 50, 100, 250, 500, 1000]
)

# Service health gauges
db_pool_available = Gauge("db_pool_connections_available", "Available DB connections")
cache_hit_ratio = Gauge("cache_hit_ratio", "Cache hit ratio (0-1)")

# Usage
async def create_order(order: Order):
    try:
        result = await payment_service.charge(order)
        payment_attempts.labels(provider="stripe", result="success").inc()
        order_value_histogram.observe(order.amount_dollars)
    except PaymentError:
        payment_attempts.labels(provider="stripe", result="failed").inc()
        raise
```

## USE method (Utilization, Saturation, Errors)

For infrastructure/resource analysis:

```
For every resource (CPU, memory, disk, network):

Utilization:  % time resource was busy
              CPU: 80% utilized
              Disk: 60% busy

Saturation:   work the resource can't process (queued)
              CPU run queue length
              Disk I/O wait queue depth

Errors:       error count
              Disk read errors
              Network packet drops
```

```promql
# CPU Utilization
100 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100

# CPU Saturation (run queue)
node_load1

# Disk Utilization  
rate(node_disk_io_time_seconds_total[5m]) * 100

# Network Errors
rate(node_network_receive_errs_total[5m])
```

## RED method (Requests, Errors, Duration)

For service/microservice analysis:

```
Rate:     requests per second
Errors:   error rate (%)
Duration: latency (p50, p99)
```

```promql
# Rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status_code=~"5.."}[5m]) 
/ rate(http_requests_total[5m]) * 100

# Duration P99
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

## Label design

Labels are dimensions for slicing metrics:

```python
# Good labels: low cardinality, business-meaningful
http_request_duration_seconds.labels(
    method="POST",         # 5 values max
    endpoint="/orders",    # ~20 values max
    status_code="201",     # ~10 values max
)

# Bad labels: high cardinality → Prometheus crashes
http_request_duration_seconds.labels(
    user_id="usr_123",     # NEVER — millions of values
    order_id="ord_456",    # NEVER — millions of values
    ip_address="1.2.3.4",  # NEVER — millions of values
    trace_id="...",        # NEVER — unique per request
)
```

**Cardinality rule:** `total time series = product of label cardinalities`. 5 methods × 20 endpoints × 10 status codes = 1000 series. Adding user_id with 1M users → 1 billion series → OOM.

## AWS CloudWatch Metrics

```python
import boto3
from datetime import datetime, timezone

cloudwatch = boto3.client('cloudwatch')

# Publish custom metric
cloudwatch.put_metric_data(
    Namespace='OrderService',
    MetricData=[
        {
            'MetricName': 'OrdersCreated',
            'Dimensions': [
                {'Name': 'Environment', 'Value': 'production'},
                {'Name': 'PaymentMethod', 'Value': 'card'},
            ],
            'Value': 1,
            'Unit': 'Count',
            'Timestamp': datetime.now(timezone.utc),
        },
        {
            'MetricName': 'OrderProcessingTime',
            'Value': 245,
            'Unit': 'Milliseconds',
            'StorageResolution': 1,  # 1-second resolution (vs default 60s)
        }
    ]
)
```

**CloudWatch built-in metrics (free):**
- EC2: CPU, NetworkIn/Out, DiskReadBytes
- RDS: CPUUtilization, DatabaseConnections, ReadLatency
- ALB: RequestCount, TargetResponseTime, HTTPCode_ELB_5XX
- Lambda: Duration, Errors, Throttles, ConcurrentExecutions
- SQS: NumberOfMessagesSent, ApproximateNumberOfMessagesVisible

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you think in terms of what to measure and why — not just "add Prometheus."

**Strong answer pattern:**
1. Four golden signals: latency, traffic, errors, saturation — covers any service
2. Use histograms for latency — never average latency (hides p99 spikes)
3. RED for services (Rate, Errors, Duration); USE for resources (Utilization, Saturation, Errors)
4. Low cardinality labels — no user IDs, order IDs, or trace IDs as labels
5. On AWS: CloudWatch for infra metrics, Prometheus + Grafana for app metrics

## Related topics

- [Logging](logging.md) — individual events vs aggregated numbers
- [Distributed Tracing](tracing.md) — request-level detail vs time-series aggregates
- [Alerting](alerting.md) — metrics drive alerts
- [SLOs & SLAs](slo-sla.md) — SLO tracking via metrics
- [Time-Series Databases](../storage/time-series-databases.md) — Prometheus, InfluxDB internals
