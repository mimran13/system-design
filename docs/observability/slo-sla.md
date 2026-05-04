# SLOs, SLAs, and Error Budgets

## The hierarchy

```
SLI (Service Level Indicator)
  └── What you measure: "99.2% of requests succeeded this week"

SLO (Service Level Objective)
  └── What you target: "99.9% of requests should succeed"

SLA (Service Level Agreement)
  └── What you promise (with consequences): "99.5% uptime, else we refund X"
```

**Rule of thumb:** SLO target > SLA commitment. If SLA is 99.5%, set SLO at 99.9% internally. The gap gives you time to react before breaching the SLA.

## SLIs — what to measure

Good SLIs measure **user experience**, not internal system health:

```
Request success rate:   successful requests / total requests
Latency:               % of requests completing under threshold (e.g., 95% < 200ms)
Availability:          time service was serving requests / total time
Throughput:            requests served per unit time (if users expect high throughput)
Data freshness:        age of data (for data pipelines, caches)
Error rate:            errors / total requests
```

```python
# SLI: Availability
# = HTTP 2xx + 4xx (client errors) / total HTTP requests
# (5xx = service error; 4xx = client error, not our fault)

availability_sli = """
sum(rate(http_requests_total{status_code!~"5.."}[5m]))
/ sum(rate(http_requests_total[5m]))
"""

# SLI: Latency (% of requests under 200ms)
latency_sli = """
sum(rate(http_request_duration_seconds_bucket{le="0.2"}[5m]))
/ sum(rate(http_request_duration_seconds_count[5m]))
"""
```

## SLOs — defining targets

```yaml
# SLO definition example
service: order-service
period: 30 days

slos:
  availability:
    description: "99.9% of checkout requests return non-5xx"
    target: 99.9%
    sli:
      metric: http_requests_total
      good_events: status_code != 5xx
      total_events: all_requests
  
  latency:
    description: "95% of requests complete under 500ms"
    target: 95%
    sli:
      metric: http_request_duration_seconds
      good_events: duration < 500ms
      total_events: all_requests
  
  data_freshness:
    description: "Inventory data is < 5 minutes stale"
    target: 99.5%
    sli:
      metric: inventory_data_age_seconds
      good_events: age < 300s
      total_events: all_measurements
```

## Error budgets

If your SLO is 99.9% availability over 30 days:

```
Total minutes in 30 days: 30 × 24 × 60 = 43,200 minutes
Error budget: (100% - 99.9%) × 43,200 = 43.2 minutes of allowed downtime

If you've used 30 minutes: 13.2 minutes remaining
If you've used 43.2 minutes: budget exhausted
If you breach: no new features until next period
```

**The error budget is a conversation between dev and ops:**
- Budget remaining → deploy new features, take risks
- Budget nearly exhausted → slow down, focus on reliability
- Budget exhausted → freeze changes, focus only on reliability work

## Error budget burn rate

Burn rate is how fast you're consuming the budget:

```
Normal burn rate: 1x
  = consuming budget at exactly the rate where you'll exhaust it at period end

14x burn rate:
  = consuming budget 14x faster than normal
  = 1/14 of your 30-day period = ~2 days until budget exhaustion

Calculation:
  Burn rate = current_error_rate / (1 - SLO_target)
  
  If SLO = 99.9% and current error rate = 0.14%:
  Burn rate = 0.14% / (100% - 99.9%) = 0.14% / 0.1% = 1.4x  (slightly elevated)
  
  If current error rate = 1.4%:
  Burn rate = 1.4% / 0.1% = 14x  (critically elevated)
```

## Multi-window alerting (Google's recommendation)

Alert on burn rate, not just current error rate. Use two windows to balance sensitivity and precision:

```yaml
# Tier 1: Fast burn — alert immediately (1hr window)
# 14x burn rate = 1hr to exhaust 1/14 of a 30-day budget
- alert: SLOFastBurn
  expr: |
    (
      rate(http_requests_total{status_code=~"5.."}[1h])
      / rate(http_requests_total[1h])
    ) > (1 - 0.999) * 14
    AND
    (
      rate(http_requests_total{status_code=~"5.."}[5m])
      / rate(http_requests_total[5m])
    ) > (1 - 0.999) * 14
  labels:
    severity: critical
  annotations:
    summary: "Fast error budget burn — page on-call"

# Tier 2: Slow burn — alert for business hours response (6hr window)
# 6x burn rate = 5 days to exhaust budget
- alert: SLOSlowBurn
  expr: |
    (
      rate(http_requests_total{status_code=~"5.."}[6h])
      / rate(http_requests_total[6h])
    ) > (1 - 0.999) * 6
    AND
    (
      rate(http_requests_total{status_code=~"5.."}[30m])
      / rate(http_requests_total[30m])
    ) > (1 - 0.999) * 6
  labels:
    severity: warning
  annotations:
    summary: "Slow error budget burn — address during business hours"
```

**Why two windows?**
- Long window (6h): catches sustained slow burns that short window would miss
- Short window (5m/30m): confirms the burn is still happening (not a resolved blip)
- Both must be true: eliminates false positives

## SLO dashboard

A good SLO dashboard shows:

```
Order Service — April 2024

Availability SLO: 99.9%    Current: 99.96% ✓
  Error budget: 43.2 min total
  Remaining: 38.7 min (89.6%)
  Burn rate (1h): 0.3x (normal)
  Burn rate (6h): 0.8x (normal)
  
Latency SLO: 95% < 500ms  Current: 97.2% ✓
  Error budget: 64,800 slow requests/30d
  Remaining: 52,300 (80.7%)
  
[30-day trend graph]
[Burn rate graph]
[Top contributing incidents]
```

```python
# Grafana panel: error budget remaining
(
  1 - (
    sum(increase(http_requests_total{status_code=~"5.."}[30d]))
    / sum(increase(http_requests_total[30d]))
  ) / (1 - 0.999)
) * 100
```

## SLAs — the commercial contract

SLAs are between you and your customers. They have teeth:

```
AWS S3 SLA:
  Monthly uptime ≥ 99.9%:  full service credit earned
  Monthly uptime < 99.9%:  10% service credit
  Monthly uptime < 99.0%:  25% service credit
  Monthly uptime < 95.0%:  100% service credit

Google Cloud SLA:
  Multi-region: 99.99% (< 4.38 min/year)
  Regional:     99.99%
  Single-zone:  99.5%

Typical SaaS SLA:
  Enterprise: 99.9% (43.8 min/month downtime)
  Business:   99.5%
  Free tier:  no SLA (best-effort)
```

**What counts as downtime:** Define precisely in SLA.
- Is a partial outage (50% of requests failing) counted?
- Is degraded performance counted?
- Is scheduled maintenance excluded?

## Setting realistic SLOs

```
Start conservative, improve over time:

1. Measure your historical reliability (last 90 days)
   "We've been at 99.7% availability"

2. Set SLO slightly lower than historical performance
   SLO: 99.5% (gives you room to maneuver)

3. After proving consistency, tighten
   SLO: 99.7% → 99.9%

Never set an SLO you can't meet consistently.
100% SLO is wrong — it leaves no budget for deployments, maintenance, or experimentation.
```

## AWS context

```
CloudWatch SLO tracking:
  - Composite alarms for multi-metric SLO
  - Anomaly detection for adaptive thresholds
  - Service Lens (maps SLOs to X-Ray traces)

AWS Managed SLAs:
  EC2:       99.99% per region
  RDS Multi-AZ: 99.95%
  DynamoDB:  99.999%
  S3:        99.99% availability, 99.999999999% durability
  EKS:       99.95%

→ Your SLO can't exceed your dependencies' SLAs
  (if RDS is 99.95%, your order service can't promise 99.99%)
```

## Interview angle

!!! tip "What interviewers are testing"
    SLO/SLA comes up in "how do you measure reliability?" and system design tradeoffs.

**Strong answer pattern:**
1. SLI = what you measure, SLO = target, SLA = contract (with consequences)
2. Error budget = allowed unreliability — use it to balance features vs reliability
3. Alert on burn rate, not absolute error rate — catches slow burns before they exhaust budget
4. Set SLO below your capability — leaves room for real incidents
5. Your SLO ceiling is your dependencies' SLA (you can't be more reliable than your database)

## Related topics

- [Alerting](alerting.md) — SLO burn rate drives alert strategy
- [Metrics](metrics.md) — SLIs are metrics
- [Availability](../fundamentals/availability.md) — the math behind nines
- [Incident Management](incident-management.md) — SLA breaches drive incident classification
