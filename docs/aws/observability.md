# AWS Observability

## The three pillars on AWS

| Pillar | AWS Service | Open-Source Alternative |
|---|---|---|
| Metrics | CloudWatch Metrics | Prometheus + Grafana |
| Logs | CloudWatch Logs | ELK/OpenSearch |
| Traces | AWS X-Ray | Jaeger / Zipkin |
| Dashboards | CloudWatch Dashboards | Grafana |
| Alerts | CloudWatch Alarms | Prometheus AlertManager |

## CloudWatch Metrics

### Built-in metrics (free, no setup)

| Service | Key metrics |
|---|---|
| EC2 | CPUUtilization, NetworkIn/Out, DiskReadOps |
| RDS | CPUUtilization, DatabaseConnections, ReadLatency, FreeStorageSpace |
| ALB | RequestCount, TargetResponseTime, HTTPCode_ELB_5XX_Count |
| Lambda | Duration, Errors, Throttles, ConcurrentExecutions, IteratorAge |
| SQS | ApproximateNumberOfMessagesVisible, NumberOfMessagesSent, ApproximateAgeOfOldestMessage |
| DynamoDB | SuccessfulRequestLatency, ConsumedReadCapacityUnits, ThrottledRequests |
| ECS | CPUUtilization, MemoryUtilization |

### Custom metrics

```python
import boto3
from datetime import datetime, timezone

cloudwatch = boto3.client('cloudwatch')

def publish_metric(name: str, value: float, unit: str, dimensions: dict):
    cloudwatch.put_metric_data(
        Namespace='OrderService',
        MetricData=[{
            'MetricName': name,
            'Dimensions': [{'Name': k, 'Value': v} for k, v in dimensions.items()],
            'Value': value,
            'Unit': unit,
            'Timestamp': datetime.now(timezone.utc),
            'StorageResolution': 1,  # 1-second resolution (vs 60s default)
        }]
    )

# Usage
publish_metric('OrdersCreated', 1, 'Count', {'Environment': 'production', 'PaymentMethod': 'card'})
publish_metric('PaymentLatency', 245, 'Milliseconds', {'Provider': 'stripe'})
publish_metric('CartAbandonmentRate', 0.23, 'None', {'Cohort': 'new_users'})
```

### CloudWatch Alarms

```python
# Composite alarm: alert only when multiple conditions are true
cloudwatch.put_composite_alarm(
    AlarmName='OrderService-Critical',
    AlarmRule=(
        "ALARM('OrderService-ErrorRate') AND ALARM('OrderService-LatencyP99')"
    ),
    AlarmActions=['arn:aws:sns:us-east-1:123:pagerduty'],
    OKActions=['arn:aws:sns:us-east-1:123:pagerduty'],
)

# Metric alarm
cloudwatch.put_metric_alarm(
    AlarmName='OrderService-ErrorRate',
    Namespace='AWS/ApplicationELB',
    MetricName='HTTPCode_Target_5XX_Count',
    Dimensions=[{'Name': 'LoadBalancer', 'Value': 'app/order-alb/...'}],
    Statistic='Sum',
    Period=60,
    EvaluationPeriods=5,        # 5 consecutive periods
    Threshold=10,
    ComparisonOperator='GreaterThanThreshold',
    TreatMissingData='notBreaching',
    AlarmActions=['arn:aws:sns:...'],
)
```

## CloudWatch Logs

### Sending logs from ECS/Lambda

```python
# ECS: configure awslogs driver in task definition
# Lambda: auto-sends to /aws/lambda/function-name

# Application: use structured logging
import structlog
import logging

# CloudWatch Logs Insights query
# fields @timestamp, order_id, level, message
# | filter level = "ERROR"
# | stats count(*) as errors by order_id
# | sort errors desc
# | limit 20
```

### CloudWatch Logs Insights

```
# P99 latency by endpoint (last 1 hour)
fields @timestamp, path, duration_ms
| filter ispresent(duration_ms)
| stats pct(duration_ms, 99) as p99 by path
| sort p99 desc

# Error rate over time
filter level = "ERROR"
| stats count(*) as error_count by bin(5min)

# Find all logs for a specific order
filter order_id = "ord_123"
| sort @timestamp asc
| limit 100

# Trace ID correlation
filter trace_id = "7f9e4321-1234-4abc-8def"
| sort @timestamp asc
```

### Log retention and costs

```python
# Set retention on log groups (don't retain forever — expensive)
cloudwatch.put_retention_policy(
    logGroupName='/ecs/order-service',
    retentionInDays=30,  # hot storage
)

# Export old logs to S3 for cheap archival
cloudwatch.create_export_task(
    logGroupName='/ecs/order-service',
    fromTime=int(thirty_days_ago.timestamp() * 1000),
    to=int(now.timestamp() * 1000),
    destination='logs-archive-bucket',
    destinationPrefix='order-service',
)
```

## AWS X-Ray (Distributed Tracing)

### Auto-instrumentation

```python
# Lambda: enable active tracing in function config
# ECS: run X-Ray daemon as sidecar container

from aws_xray_sdk.core import xray_recorder, patch_all

# Instrument all supported libraries
patch_all()  # boto3, requests, psycopg2, pymongo, etc.

xray_recorder.configure(
    service='order-service',
    sampling_rules={
        'default': {
            'fixed_target': 1,      # always sample 1 req/s
            'rate': 0.05,           # 5% of remaining
        },
        'rules': [{
            'service_name': 'order-service',
            'http_method': 'POST',
            'url_path': '/orders',
            'fixed_target': 10,     # always sample 10 req/s for create-order
            'rate': 0.1,
        }]
    }
)

# Custom subsegments
@xray_recorder.capture('process_payment')
def process_payment(order: Order):
    subsegment = xray_recorder.current_subsegment()
    subsegment.put_annotation('order_id', order.id)
    subsegment.put_annotation('amount', order.amount_cents)
    
    result = stripe_charge(order)
    subsegment.put_metadata('stripe_response', result)
    return result
```

### X-Ray Service Map

X-Ray automatically builds a service dependency graph from traces:

```
[Route 53] → [CloudFront] → [ALB] → [ECS: order-service]
                                           ├── [RDS: orders-db]   avg: 5ms
                                           ├── [ElastiCache]      avg: 0.5ms
                                           └── [ECS: payment-svc] avg: 230ms ← bottleneck
                                                    └── [Stripe API]           avg: 220ms
```

Each edge shows: request rate, error rate, latency.

## Container Insights

Enhanced observability for ECS and EKS without custom instrumentation:

```python
# Enable Container Insights on ECS cluster
ecs.update_cluster_settings(
    cluster='production',
    settings=[{
        'name': 'containerInsights',
        'value': 'enabled'
    }]
)

# Provides metrics:
# ContainerInsights/CpuUtilized
# ContainerInsights/MemoryUtilized
# ContainerInsights/NetworkRxBytes
# ContainerInsights/StorageWriteBytes
# Pod-level, container-level, cluster-level breakdown
```

## Amazon Managed Prometheus + Grafana (AMP + AMG)

For Prometheus-based metrics on EKS without managing Prometheus infrastructure:

```yaml
# EKS: configure Prometheus to remote-write to AMP
# prometheus.yml
remote_write:
  - url: https://aps-workspaces.us-east-1.amazonaws.com/workspaces/ws-abc123/api/v1/remote_write
    sigv4:
      region: us-east-1
    queue_config:
      max_samples_per_send: 1000
      max_shards: 200
      capacity: 2500
```

Then connect Amazon Managed Grafana to AMP as a data source — fully managed dashboards with IAM auth.

## CloudWatch Dashboards

```python
cloudwatch.put_dashboard(
    DashboardName='OrderService-Production',
    DashboardBody=json.dumps({
        'widgets': [
            {
                'type': 'metric',
                'properties': {
                    'title': 'Request Rate (RPS)',
                    'metrics': [
                        ['AWS/ApplicationELB', 'RequestCount', 'LoadBalancer', alb_id,
                         {'stat': 'Sum', 'period': 60, 'label': 'Requests/min'}]
                    ],
                    'period': 60,
                    'view': 'timeSeries',
                }
            },
            {
                'type': 'metric',
                'properties': {
                    'title': 'P99 Latency',
                    'metrics': [
                        ['AWS/ApplicationELB', 'TargetResponseTime', 'LoadBalancer', alb_id,
                         {'stat': 'p99', 'period': 60}]
                    ],
                }
            },
            {
                'type': 'log',
                'properties': {
                    'title': 'Recent Errors',
                    'query': "SOURCE '/ecs/order-service' | fields @timestamp, message | filter level='ERROR' | limit 20",
                    'region': 'us-east-1',
                }
            }
        ]
    })
)
```

## AWS observability tooling summary

```
Startup / simple: CloudWatch only
  → Zero setup, integrated with all AWS services
  → Logs Insights for ad-hoc queries
  → Alarms + SNS for notifications

Growing teams: CloudWatch + X-Ray
  → Add distributed tracing
  → Service Map shows dependency bottlenecks

Scale / multi-service: Prometheus + Grafana + Jaeger/X-Ray
  → AMP for managed Prometheus
  → AMG for managed Grafana
  → OpenTelemetry for vendor-neutral instrumentation
  → CloudWatch still used for infra metrics

Fully managed enterprise: Datadog / New Relic / Honeycomb
  → Single pane: logs, metrics, traces
  → Better UX, higher cost
```

## Related topics

- [Logging](../observability/logging.md)
- [Metrics](../observability/metrics.md)
- [Distributed Tracing](../observability/tracing.md)
- [Alerting](../observability/alerting.md)
- [SLOs & SLAs](../observability/slo-sla.md)
