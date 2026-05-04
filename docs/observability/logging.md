# Logging

## What it is

Logging is the record of discrete events that occurred in a system — what happened, when, and with what context. Logs are the raw material for debugging, auditing, and alerting. Unlike metrics (aggregated numbers) and traces (request journeys), logs capture the full detail of individual events.

## Structured logging

The shift from unstructured to structured logs is the most important logging practice:

```
Unstructured (BAD):
2024-04-26 14:00:00 ERROR Failed to process order ord_123 for user usr_456: payment declined

→ Can't filter by order_id or user_id without regex
→ Machine-parsing is brittle
→ Different services format differently

Structured (GOOD):
{
  "timestamp": "2024-04-26T14:00:00.000Z",
  "level": "ERROR",
  "message": "Payment declined",
  "service": "order-service",
  "version": "2.1.4",
  "order_id": "ord_123",
  "user_id": "usr_456",
  "payment_provider": "stripe",
  "decline_code": "insufficient_funds",
  "trace_id": "7f9e4321-1234-4abc-8def",
  "span_id": "abc123",
  "duration_ms": 245
}

→ Filter by any field instantly
→ Aggregate, group, visualize
→ Correlate with traces
```

### Implementation

```python
import structlog
import logging

# Configure once at startup
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

log = structlog.get_logger()

# Basic structured logging
log.info("order.created", order_id="ord_123", user_id="usr_456", amount_cents=2999)
log.error("payment.declined", order_id="ord_123", decline_code="insufficient_funds", exc_info=True)

# Bind context for a request (propagates to all logs in that context)
with structlog.contextvars.bind_contextvars(
    trace_id="7f9e4321",
    request_id="req_abc",
    user_id="usr_456",
):
    log.info("request.started", path="/orders", method="POST")
    # ... handle request ...
    log.info("order.created", order_id="ord_123")
    log.info("request.completed", status=201, duration_ms=45)
    # All three logs automatically include trace_id, request_id, user_id
```

## Log levels

| Level | When to use | Examples |
|---|---|---|
| **DEBUG** | Detailed diagnostic information | SQL queries, function entry/exit, variable values |
| **INFO** | Normal operational events | Order created, user logged in, job completed |
| **WARN** | Unexpected but handled; might indicate a problem | Retry attempt, slow query, deprecated API used |
| **ERROR** | Failure that requires attention | Payment declined, DB connection failed, exception |
| **FATAL/CRITICAL** | Unrecoverable failure, service about to stop | OOM, required config missing |

```python
# Good level hygiene
log.debug("cache.lookup", key="user:123", hit=False)        # too noisy for INFO
log.info("order.created", order_id="ord_123")                # expected business event
log.warning("retry.attempt", attempt=2, max_attempts=3)      # worth noting, not alerting
log.error("payment.failed", error=str(e), order_id="ord_123") # needs attention
log.critical("database.connection_lost", retries_exhausted=True)  # on-call now
```

**Level configuration:**
- Production: INFO and above (suppress DEBUG)
- Development: DEBUG
- Never hardcode levels — use environment variable (`LOG_LEVEL=INFO`)

## What to log (and what not to)

### Always log

```python
# Request/response (at service boundary)
log.info("http.request", method="POST", path="/orders", 
         status=201, duration_ms=45, request_id="req_abc")

# Business events (audit trail)
log.info("order.created", order_id="ord_123", user_id="usr_456")
log.info("payment.charged", order_id="ord_123", amount_cents=2999, idempotency_key="key_xyz")
log.info("order.shipped", order_id="ord_123", tracking_number="1Z999AA10123456784")

# Errors with context
log.error("payment.failed", order_id="ord_123", error_code="insufficient_funds",
          attempt=1, exc_info=True)

# Security events
log.warning("auth.failed", user_id="usr_456", ip="192.168.1.1", reason="invalid_password")
log.info("auth.success", user_id="usr_456", ip="192.168.1.1")

# External service calls
log.info("stripe.charge", duration_ms=234, success=True, charge_id="ch_abc")
```

### Never log

```python
# PII / sensitive data — privacy violation, compliance risk
log.info("user.updated", password="secret123")      # NEVER
log.info("payment.processed", card_number="4111...")  # NEVER
log.info("user.login", ssn="123-45-6789")           # NEVER

# High-frequency noise
log.debug("cache.check", key="user:123")  # OK in debug, not INFO in prod
# Avoid logging inside tight loops

# Binary/large data
log.info("file.processed", content=large_binary_blob)  # causes bloat
```

### Masking PII

```python
import re

def mask_card_number(card: str) -> str:
    return re.sub(r'\d(?=\d{4})', '*', card)

def mask_email(email: str) -> str:
    user, domain = email.split("@")
    return f"{user[:2]}***@{domain}"

log.info("payment.processed", 
         card_last_four=card[-4:],          # only last 4
         email_masked=mask_email(email))     # masked
```

## Log correlation with traces

Log lines are isolated. Traces connect them. Link them with trace IDs:

```python
from opentelemetry import trace

def get_log_context() -> dict:
    span = trace.get_current_span()
    ctx = span.get_span_context()
    return {
        "trace_id": format(ctx.trace_id, '032x') if ctx.is_valid else None,
        "span_id": format(ctx.span_id, '016x') if ctx.is_valid else None,
    }

# Automatically include trace context in every log
structlog.contextvars.bind_contextvars(**get_log_context())
log.info("order.created", order_id="ord_123")
# → {"trace_id": "7f9e4321...", "span_id": "abc123", "order_id": "ord_123", ...}
```

In Grafana/Kibana: click a trace → jump to logs for that trace ID. Eliminates manual log hunting.

## Log aggregation pipeline

```
Application pods          Aggregation          Storage & Search
    │                         │                      │
Pod 1 → stdout ──┐            │                      │
Pod 2 → stdout ──┤        Fluentd/            Elasticsearch
Pod 3 → stdout ──┘        Fluent Bit  ──────► OpenSearch
                           (sidecar or         CloudWatch Logs
                            DaemonSet)         Datadog
                               │               Splunk
                           Buffer, filter,
                           enrich, route
```

### Fluentd / Fluent Bit

```yaml
# Fluent Bit config (Kubernetes DaemonSet)
[INPUT]
    Name              tail
    Path              /var/log/containers/*.log
    Parser            docker
    Tag               kube.*
    Refresh_Interval  5

[FILTER]
    Name              kubernetes
    Match             kube.*
    Kube_URL          https://kubernetes.default.svc:443
    Merge_Log         On           # merge JSON log into record
    Keep_Log          Off

[FILTER]
    Name              grep
    Match             *
    Exclude           level debug  # drop debug logs in prod

[OUTPUT]
    Name              es
    Match             *
    Host              opensearch.us-east-1.es.amazonaws.com
    Port              443
    TLS               On
    Index             logs-${tag[2]}-%Y.%m.%d  # per-service daily index
```

## Log retention and costs

```
Log volume: 1KB/request × 10,000 RPS = 10MB/s = 860GB/day

Cost:
  CloudWatch Logs: $0.50/GB ingestion + $0.03/GB storage
  → 860GB/day = $430/day ingestion alone!

Strategies:
  1. Sample: log 100% of errors, 10% of INFO, 1% of DEBUG
  2. Filter at source: drop health check logs, debug logs
  3. Tiered storage: hot (7 days) → warm (30 days) → cold S3 (1 year)
  4. Compression: JSON compresses ~10x in gzip
```

```python
# Sampling: always log errors, sample INFO
import random

class SamplingFilter(logging.Filter):
    def filter(self, record):
        if record.levelno >= logging.ERROR:
            return True  # always log errors
        return random.random() < 0.1  # sample 10% of INFO/DEBUG
```

## CloudWatch Logs (AWS)

```python
import boto3

# Send logs to CloudWatch
client = boto3.client('logs', region_name='us-east-1')

# Log Insights query
query = """
fields @timestamp, order_id, error_code, user_id
| filter level = "ERROR" and service = "order-service"
| stats count(*) by error_code
| sort count desc
| limit 10
"""

response = client.start_query(
    logGroupName='/ecs/order-service',
    startTime=int((datetime.now() - timedelta(hours=1)).timestamp()),
    endTime=int(datetime.now().timestamp()),
    queryString=query
)
```

```
Useful CloudWatch Insights patterns:

# Count errors by type in last hour
filter level = "ERROR"
| stats count(*) as error_count by error_code
| sort error_count desc

# P99 latency by endpoint
filter ispresent(duration_ms)
| stats pct(duration_ms, 99) as p99, count() as requests by path
| sort p99 desc

# Trace all logs for a specific order
filter order_id = "ord_123"
| sort @timestamp asc
```

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you understand logging beyond "print statements."

**Strong answer pattern:**
1. Structured JSON logs — machine-parseable, filterable by any field
2. Consistent fields: trace_id, request_id, user_id, service, version in every log
3. Log at service boundaries and state transitions (business events)
4. Never log PII — mask or hash sensitive data
5. Correlate logs with traces using trace_id
6. Costs matter — sample/filter at source, tier by age

## Related topics

- [Metrics](metrics.md) — aggregated numbers vs individual events
- [Distributed Tracing](tracing.md) — correlate logs with request flows
- [Alerting](alerting.md) — trigger alerts from log patterns
- [SLOs & SLAs](slo-sla.md) — logs feed SLO calculations
