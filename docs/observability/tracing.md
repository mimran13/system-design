# Distributed Tracing

## What it is

Distributed tracing tracks a single request as it flows through multiple services. In a microservices system, a single user action might touch 10 services — tracing stitches these calls into one end-to-end picture.

```
Without tracing:
  User: "The checkout is slow" 
  You: grep logs across 8 services, try to correlate by timestamp
  Result: 2 hours of debugging

With tracing:
  User: "The checkout is slow"
  You: find the trace ID, click it in Jaeger/Zipkin/Datadog
  Result: "Payment API took 2.8s — 3 retries after timeout"
  Time: 2 minutes
```

## Concepts

### Trace

A trace represents one end-to-end request through the system. Identified by a unique **trace ID**.

### Span

A span represents a single unit of work within a trace. Every service call, DB query, or external API call is a span.

```
Trace: checkout-request (trace_id: 7f9e4321)
│
├── Span: API Gateway (10ms)
│
├── Span: Order Service (280ms) ← root span
│   ├── Span: Validate cart (5ms)
│   ├── Span: PostgreSQL query (12ms)
│   │   └── "SELECT * FROM cart_items WHERE session_id = $1"
│   ├── Span: Payment Service gRPC (245ms)
│   │   ├── Span: Fraud check (15ms)
│   │   └── Span: Stripe API (225ms) ← bottleneck!
│   └── Span: Inventory check (8ms)
│
└── Span: Notification Service (async, 50ms)
```

### Span attributes

```python
{
    "trace_id": "7f9e4321-1234-4abc-8def",
    "span_id": "abc123de",
    "parent_span_id": "xyz789",
    "operation_name": "payment.charge",
    "service_name": "payment-service",
    "start_time": "2024-04-26T14:00:00.000Z",
    "end_time": "2024-04-26T14:00:00.225Z",
    "duration_ms": 225,
    "status": "OK",
    "attributes": {
        "payment.provider": "stripe",
        "payment.amount_cents": 2999,
        "http.method": "POST",
        "http.url": "https://api.stripe.com/v1/charges",
        "http.status_code": 200
    },
    "events": [
        {"name": "retry.attempt", "timestamp": "...", "attempt": 1}
    ]
}
```

## OpenTelemetry (OTel)

The vendor-neutral standard for distributed tracing (also metrics and logs). Instrumentation once → export to any backend.

```
Application Code
      │
 OTel SDK (instrument)
      │
 OTel Collector (receive, process, export)
      │
      ├──► Jaeger (self-hosted)
      ├──► Zipkin (self-hosted)
      ├──► AWS X-Ray
      ├──► Datadog
      └──► Honeycomb
```

### Instrumentation

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

# Setup — do this once at startup
provider = TracerProvider()
processor = BatchSpanProcessor(OTLPSpanExporter(endpoint="http://otel-collector:4317"))
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

# Auto-instrumentation (covers most cases)
FastAPIInstrumentor.instrument_app(app)     # HTTP requests
HTTPXClientInstrumentor().instrument()      # outgoing HTTP calls
SQLAlchemyInstrumentor().instrument(engine=engine)  # SQL queries

# Manual instrumentation (for custom operations)
tracer = trace.get_tracer("order-service")

async def process_payment(order: Order):
    with tracer.start_as_current_span("payment.process") as span:
        span.set_attribute("order.id", order.id)
        span.set_attribute("payment.amount_cents", order.amount_cents)
        span.set_attribute("payment.provider", "stripe")
        
        try:
            result = await stripe_client.charge(order)
            span.set_attribute("payment.charge_id", result.charge_id)
            return result
        except StripeError as e:
            span.set_status(trace.Status(trace.StatusCode.ERROR, str(e)))
            span.record_exception(e)
            raise
```

### Context propagation

The trace ID must be passed between services. OTel does this via HTTP headers:

```
W3C Trace Context (standard):
  traceparent: 00-7f9e432112344abc8def000000000001-abc123de456789ff-01
               version | trace_id (32 hex)           | span_id (16 hex) | flags

Order Service → Payment Service:
  POST /v1/charge
  traceparent: 00-7f9e4321...-abc123de-01  ← current trace + span
```

```python
# OTel handles this automatically with auto-instrumentation
# Manual: use inject/extract

from opentelemetry.propagate import inject, extract

# Outgoing request (inject current context into headers)
headers = {}
inject(headers)  # adds traceparent, tracestate
response = await httpx_client.post(url, headers=headers, json=payload)

# Incoming request (extract context from headers)
ctx = extract(request.headers)
with tracer.start_as_current_span("handle.request", context=ctx):
    ...
```

## Sampling

In production, tracing every request is expensive. Sample intelligently:

```python
from opentelemetry.sdk.trace.sampling import (
    ALWAYS_ON,
    TraceIdRatioBased,
    ParentBased,
)

# Sample 1% of all traces
sampler = TraceIdRatioBased(0.01)

# Sample 1%, but always sample if parent says to (tail-based from gateway)
sampler = ParentBased(root=TraceIdRatioBased(0.01))
```

### Sampling strategies

| Strategy | How | Use case |
|---|---|---|
| **Head sampling** | Decision at trace start | Simple, low overhead |
| **Tail sampling** | Decision after trace complete (based on outcome) | Sample 100% of errors, 1% of success |
| **Rate limiting** | Sample N traces per second | Prevent burst costs |
| **Adaptive** | Adjust rate based on load | Complex, most accurate |

```yaml
# OTel Collector tail sampling (recommended)
processors:
  tail_sampling:
    decision_wait: 10s
    num_traces: 50000
    policies:
      - name: errors-policy
        type: status_code
        status_code: {status_codes: [ERROR]}  # 100% of errors
      
      - name: high-latency-policy
        type: latency
        latency: {threshold_ms: 1000}  # 100% of slow requests
      
      - name: probabilistic-policy
        type: probabilistic
        probabilistic: {sampling_percentage: 1}  # 1% of everything else
```

## Flame graphs and waterfall views

**Waterfall view** (Jaeger/Zipkin): shows spans on a timeline, good for seeing sequential vs parallel work.

```
Checkout request (350ms)
├─[0ms]    API Gateway                    ████ 10ms
├─[10ms]   Order Service                  ███████████████████████ 280ms
│  ├─[10ms]  Validate cart                █ 5ms
│  ├─[15ms]  DB: SELECT cart_items        ███ 12ms
│  ├─[27ms]  Payment Service             ████████████████████ 245ms  ← bottleneck
│  │  ├─[27ms]  Fraud check              ██ 15ms
│  │  └─[42ms]  Stripe API call          █████████████████ 225ms
│  └─[272ms] Inventory check             ██ 8ms
└─[290ms]  Notification (async)          █ 50ms
```

**Flame graph**: shows CPU time grouped by call stack — useful for profiling hot paths.

## Connecting traces to logs and metrics

The three pillars of observability form a complete picture when correlated:

```
User reports slowness at 14:00
  │
  ├── Metrics: see p99 spike to 3s at 14:00 (Grafana dashboard)
  │
  ├── Traces: find slow traces around 14:00 → Stripe API 2.8s (Jaeger)
  │
  └── Logs: filter by trace_id from slow trace → "Stripe timeout on attempt 1, retry 2" (CloudWatch)
```

```python
# Include trace_id in every log line
import structlog
from opentelemetry import trace

def get_trace_context():
    span = trace.get_current_span()
    ctx = span.get_span_context()
    if ctx.is_valid:
        return {
            "trace_id": format(ctx.trace_id, '032x'),
            "span_id": format(ctx.span_id, '016x'),
        }
    return {}

log = structlog.get_logger()

async def handle_order(order_id: str):
    # Bind trace context to all logs in this span
    structlog.contextvars.bind_contextvars(**get_trace_context())
    log.info("order.processing", order_id=order_id)
    # → {"trace_id": "7f9e4321...", "span_id": "abc123...", "order_id": "ord_123"}
```

## AWS X-Ray

AWS's managed tracing service, integrated with ECS, Lambda, API Gateway, and more.

```python
# Lambda auto-tracing: enable in Lambda config
# ECS: run X-Ray daemon as sidecar

from aws_xray_sdk.core import xray_recorder, patch_all

patch_all()  # auto-instruments boto3, requests, httpx, sqlalchemy

xray_recorder.configure(service='order-service')

@xray_recorder.capture('process_payment')
def process_payment(order):
    # X-Ray creates a subsegment automatically
    xray_recorder.current_subsegment().put_annotation('order_id', order.id)
    xray_recorder.current_subsegment().put_metadata('payload', order.to_dict())
    return stripe_charge(order)
```

**X-Ray Service Map:** Visual graph of all services and their dependencies, with error rates and latency for each edge. Automatically built from traces.

```
[API Gateway] → [Order Lambda] → [RDS PostgreSQL]
                     │
                     └→ [Payment Lambda] → [DynamoDB]
                                  │
                                  └→ [Stripe API]
```

## Interview angle

!!! tip "What interviewers are testing"
    Tracing comes up in "how would you debug latency in a microservices system?"

**Strong answer pattern:**
1. Trace ID is the primary key — propagate in every request header
2. Span every external call (DB, API, queue publish) — that's where time is spent
3. Tail-based sampling — 100% of errors, 1% of success traces → cost control
4. Correlate with logs via trace_id — click trace → jump to logs
5. AWS: X-Ray integrates with Lambda, ECS, API Gateway out of the box

## Related topics

- [Logging](logging.md) — correlate logs with trace_id
- [Metrics](metrics.md) — RED metrics alert you; traces explain why
- [Alerting](alerting.md) — trace-based SLO alerting
- [Service Discovery](../distributed/service-discovery.md) — context propagation across services
