# Alerting

## What it is

Alerting is the automated detection and notification of conditions that require human attention. Good alerting is signal (real problems) without noise (false alarms). Every unnecessary alert erodes trust, causes alert fatigue, and makes engineers ignore pages.

```
Alert fatigue lifecycle:
  1. System has problem
  2. Engineer adds alert
  3. Alert fires frequently (noise)
  4. Engineers start ignoring it
  5. Real incident fires
  6. Alert ignored → extended outage
  
Rule: every alert should be actionable and urgent.
```

## Symptom vs cause

Alert on **symptoms** (user-visible impact), not **causes** (internal state):

```
Cause-based (BAD):
  Alert: "CPU > 80%"
  → CPU at 80% is fine if response time is normal
  → CPU at 80% with 500ms latency increase is a problem
  
Symptom-based (GOOD):
  Alert: "p99 latency > 1000ms for 5 minutes"
  → Users are experiencing slowness, regardless of why

Cause-based (BAD):
  Alert: "DLQ has messages"
  → DLQ always has some messages; not always urgent
  
Symptom-based (GOOD):
  Alert: "DLQ depth > 1000 for 30 minutes" (sustained failure)
```

## Alert properties

A well-designed alert has:

| Property | Description |
|---|---|
| **Actionable** | On-call knows what to do (runbook link) |
| **Urgent** | Actually needs human attention now |
| **Signal** | Not a false positive |
| **Novel** | Not already being handled |
| **Scoped** | Clear which service/component |

## Prometheus alerting

```yaml
# alerting_rules.yml
groups:
  - name: order-service
    rules:
      # Error rate alert
      - alert: HighErrorRate
        expr: |
          (
            rate(http_requests_total{service="order-service", status_code=~"5.."}[5m])
            / rate(http_requests_total{service="order-service"}[5m])
          ) > 0.01
        for: 5m
        labels:
          severity: critical
          team: payments
        annotations:
          summary: "High error rate on order-service"
          description: "Error rate is {{ printf \"%.2f\" $value }}% (threshold: 1%)"
          runbook: "https://wiki.example.com/runbooks/order-service-errors"
          dashboard: "https://grafana.example.com/d/order-service"
      
      # Latency alert
      - alert: HighP99Latency
        expr: |
          histogram_quantile(0.99,
            sum(rate(http_request_duration_seconds_bucket{service="order-service"}[5m]))
            by (le, endpoint)
          ) > 1.0
        for: 10m
        labels:
          severity: warning
          team: payments
        annotations:
          summary: "p99 latency > 1s on {{ $labels.endpoint }}"
          description: "p99 is {{ printf \"%.2f\" $value }}s"
          runbook: "https://wiki.example.com/runbooks/high-latency"
      
      # Queue depth alert
      - alert: HighQueueDepth
        expr: queue_depth{queue_name="orders"} > 10000
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Order queue depth exceeding 10,000"
          description: "Queue depth: {{ $value }}"
```

### `for` clause (pending period)

The `for: 5m` means the condition must be true for 5 continuous minutes before alerting. This eliminates transient spikes:

```
Without for:
  Error spike at 14:00:00 → alert fires at 14:00:00
  Resolves at 14:00:05 → alert resolves
  → 1 page for a 5-second spike (noise)

With for: 5m:
  Error spike at 14:00:00 → alert enters PENDING state
  Resolves at 14:00:05 → alert returns to INACTIVE (never fired)
  → Zero pages (correct)

  Error spike at 14:00:00, sustained
  14:05:00 → alert fires (real problem confirmed)
```

### Alert routing (Alertmanager)

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'service']
  group_wait: 30s      # wait before sending first alert (group more)
  group_interval: 5m   # how long to wait before sending new group alerts
  repeat_interval: 4h  # how often to re-notify unresolved alerts
  receiver: default
  
  routes:
    - match:
        severity: critical
        team: payments
      receiver: pagerduty-payments
      continue: false
    
    - match:
        severity: warning
      receiver: slack-warnings
      continue: true

receivers:
  - name: pagerduty-payments
    pagerduty_configs:
      - routing_key: "..."
        description: '{{ template "pagerduty.default.description" . }}'
  
  - name: slack-warnings
    slack_configs:
      - api_url: "https://hooks.slack.com/services/..."
        channel: "#alerts-warnings"
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
  
  - name: default
    slack_configs:
      - channel: "#alerts-all"
```

### Inhibition rules

Suppress child alerts when parent fires (avoid noise storms):

```yaml
# alertmanager.yml
inhibit_rules:
  # If the entire order-service is down, suppress individual endpoint alerts
  - source_match:
      alertname: OrderServiceDown
    target_match_re:
      alertname: HighP99Latency|HighErrorRate
    equal: ['service']
  
  # If staging is having issues, suppress staging alerts
  - source_match:
      environment: staging
      severity: critical
    target_match:
      environment: staging
```

## CloudWatch Alarms (AWS)

```python
import boto3

cloudwatch = boto3.client('cloudwatch')

# Composite alarm: only page if BOTH conditions are true
cloudwatch.put_composite_alarm(
    AlarmName='OrderService-Critical',
    AlarmDescription='Order service needs immediate attention',
    AlarmRule=(
        "ALARM('OrderService-ErrorRate') AND ALARM('OrderService-LatencyP99')"
    ),
    AlarmActions=['arn:aws:sns:us-east-1:123456789:pagerduty-topic'],
    OKActions=['arn:aws:sns:us-east-1:123456789:pagerduty-topic'],
)

# Metric alarm with anomaly detection
cloudwatch.put_metric_alarm(
    AlarmName='OrderService-AnomalousErrorRate',
    AlarmDescription='Error rate is anomalously high',
    Metrics=[
        {
            'Id': 'm1',
            'MetricStat': {
                'Metric': {
                    'Namespace': 'OrderService',
                    'MetricName': 'ErrorRate',
                },
                'Period': 300,
                'Stat': 'Average',
            }
        },
        {
            'Id': 'ad1',
            'Expression': 'ANOMALY_DETECTION_BAND(m1, 2)',  # 2 standard deviations
            'Label': 'Expected range',
        }
    ],
    ComparisonOperator': 'GreaterThanUpperThreshold',
    ThresholdMetricId': 'ad1',
    EvaluationPeriods': 3,
    TreatMissingData': 'notBreaching',
    AlarmActions': ['arn:aws:sns:...'],
)
```

## Runbooks

Every alert must link to a runbook. Runbooks eliminate the 3am "what do I do?" problem:

```markdown
# Runbook: HighErrorRate on order-service

## When this fires
Error rate > 1% for 5+ minutes on order-service.

## Immediate steps
1. Check dashboard: https://grafana.example.com/d/order-service
2. Check recent deployments: `kubectl rollout history deployment/order-service`
3. Check dependencies:
   - Payment service: https://grafana.example.com/d/payment-service
   - PostgreSQL: https://grafana.example.com/d/postgres

## Common causes and fixes

### Database connection pool exhausted
Symptom: errors spike, DB connections maxed in metrics
Fix: `kubectl rollout restart deployment/order-service` (resets pools)
Prevention: increase pool size in config if recurring

### Bad deployment
Symptom: errors started with recent rollout
Fix: `kubectl rollout undo deployment/order-service`
Prevention: add canary deployment to catch before 100%

### Downstream dependency (payment service)
Symptom: errors are all payment-related in logs
Fix: check payment service runbook, escalate to payments team
Prevention: circuit breaker should auto-activate

## Escalation
- Not resolved in 30 min: escalate to service owner (on-call schedule)
- Customer impact: post to #incidents channel
```

## Alert severity levels

| Severity | Response | Example |
|---|---|---|
| **Critical/P1** | Wake someone up, immediate response | Production down, data loss |
| **High/P2** | Response within 30 minutes | Partial outage, significant degradation |
| **Medium/P3** | Response next business day | Non-critical feature degraded |
| **Low/P4** | Track and fix eventually | Performance optimization opportunities |

```yaml
# Map to correct notification channel
critical: PagerDuty → phone call
high:     PagerDuty → push notification
medium:   Slack #alerts channel
low:      JIRA ticket (automated)
```

## SLO-based alerting

Alert on SLO burn rate — how fast you're consuming your error budget:

```yaml
# If burning error budget 14x faster than normal → 1hr until budget exhausted
- alert: SLOBudgetBurnRateHigh
  expr: |
    (
      rate(http_requests_total{status_code=~"5.."}[1h])
      / rate(http_requests_total[1h])
    ) > (1 - 0.999) * 14  # 14x burn rate against 99.9% SLO
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Error budget burning 14x fast — 1hr until exhausted"
```

See [SLO & SLA](slo-sla.md) for full error budget alerting.

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you understand the ops side of production systems.

**Strong answer pattern:**
1. Alert on symptoms (user-visible impact), not causes (internal metrics)
2. Every alert must be actionable — link to runbook, clear owner
3. Use `for` periods — avoid alerting on transient spikes
4. Severity levels: critical pages on-call, warnings go to Slack
5. Inhibition rules to prevent noise storms during major incidents
6. SLO burn rate alerting is the mature approach

## Related topics

- [Metrics](metrics.md) — the data that drives alerts
- [SLOs & SLAs](slo-sla.md) — alert when error budget burns
- [Incident Management](incident-management.md) — what happens after an alert fires
- [Logging](logging.md) — logs provide context after alert fires
