# Backoff Strategies

## What it is

Backoff is the practice of waiting progressively longer between retries. Without backoff, a retrying client hammers a struggling service and prevents recovery.

## You'll see this when...

- Brief outage → all clients retry simultaneously → outage prolonged (thundering herd)
- "We added retries and now everything is worse"
- All retries land at exactly the same millisecond — synchronisation problem
- AWS SDK / gRPC defaults already use backoff with jitter (you may not realise)
- Postmortems mention "retry storm" or "synchronised retry"
- Need to recover gracefully from rate-limit (429) responses
- A queue consumer keeps trying a poison message — needs backoff + DLQ

## Why backoff matters

```
Service is overloaded (10,000 RPS limit hit):
  
Without backoff:
  1,000 clients retry every 100ms
  = 10,000 retries/sec = same load that caused the problem
  Service never recovers

With exponential backoff:
  Retries spread out over time
  Service load reduces → recovery begins
  Clients eventually get responses
```

## Strategies

### Fixed delay

Wait a constant time between retries:
```
Retry 1: wait 1 second
Retry 2: wait 1 second
Retry 3: wait 1 second
```

Simple but doesn't handle coordinated storms. Multiple clients retry simultaneously.

### Linear backoff

Increase wait linearly:
```
Retry 1: wait 1 second
Retry 2: wait 2 seconds
Retry 3: wait 3 seconds
Retry 4: wait 4 seconds
```

Better, but still predictable — all clients retry at the same relative times.

### Exponential backoff

Double the wait with each retry:
```
Retry 1: wait 0.1s
Retry 2: wait 0.2s
Retry 3: wait 0.4s
Retry 4: wait 0.8s
Retry 5: wait 1.6s
...
Cap at: 30s (or whatever max makes sense)
```

```python
import time

def exponential_backoff(attempt: int, base: float = 0.1, cap: float = 30) -> float:
    return min(cap, base * (2 ** attempt))

for attempt in range(max_retries):
    try:
        result = call_service()
        break
    except RetryableError:
        if attempt == max_retries - 1:
            raise
        sleep_time = exponential_backoff(attempt)
        time.sleep(sleep_time)
```

### Exponential backoff with jitter

The thundering herd problem: even with exponential backoff, if all clients fail at the same time (e.g., service restart), they all back off for the same duration → retry simultaneously → overload again.

**Jitter** randomizes the delay:

```python
import random

def exponential_backoff_jitter(attempt: int, base: float = 0.1, cap: float = 30) -> float:
    exp_delay = min(cap, base * (2 ** attempt))
    return random.uniform(0, exp_delay)  # Full jitter (AWS recommendation)
```

```
All 1,000 clients fail simultaneously:
  Without jitter: all wait 0.1s → all retry at t=0.1s → overload
  With jitter: each waits random(0, 0.1s) → retries spread across 0-100ms window
```

**Equal jitter (bounded randomness):**
```python
def equal_jitter(attempt: int, base: float = 0.1, cap: float = 30) -> float:
    exp_delay = min(cap, base * (2 ** attempt))
    return exp_delay / 2 + random.uniform(0, exp_delay / 2)
    # Half fixed, half random → bounded but not synchronized
```

**Decorrelated jitter (AWS recommendation for best spread):**
```python
def decorrelated_jitter(previous_sleep: float, base: float = 0.1, cap: float = 30) -> float:
    return random.uniform(base, min(cap, previous_sleep * 3))

# Usage:
sleep = base
for attempt in range(max_retries):
    try:
        result = call_service()
        break
    except RetryableError:
        sleep = decorrelated_jitter(sleep)
        time.sleep(sleep)
```

## Practical comparison

```
All 1000 clients retry starting at t=0

Fixed delay (1s):
  t=1:  1000 requests (thundering herd)
  t=2:  1000 requests
  ...

Exponential (no jitter, base=100ms):
  t=100ms: 1000 requests
  t=200ms: 1000 requests
  ...

Full jitter:
  Spread across [0, cap] uniformly
  No synchronization → smooth recovery load
```

## Retry-after header

When a service returns 429 or 503, it can include `Retry-After`:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30

or

HTTP/1.1 503 Service Unavailable
Retry-After: Thu, 26 Apr 2024 14:00:00 GMT
```

Client should respect this instead of using its own backoff:
```python
response = requests.get(url)
if response.status_code == 429:
    retry_after = int(response.headers.get('Retry-After', 60))
    time.sleep(retry_after)
    # retry
```

## Circuit breaker integration

Backoff applies to individual retries within a request. Circuit breaker applies across requests when failure rate is high:

```
Retry with backoff:
  First attempt fails → wait 0.1s → retry → wait 0.2s → retry → give up after 5 attempts

Circuit breaker:
  50% of requests failing over 10s → open circuit
  All subsequent requests fail immediately (no attempts, no backoff)
  After 30s → half-open → test with one request
```

Use both: retry for individual transient failures; circuit breaker for sustained dependency failure.

## AWS SDK defaults

```python
# AWS SDK v2 retry modes:
# standard: 3 attempts, exponential backoff + jitter
# adaptive: adds client-side rate limiting (tokens per second)

import boto3
from botocore.config import Config

config = Config(
    retries={
        'max_attempts': 5,
        'mode': 'standard'
    }
)
```

**DynamoDB:** Provisioned throughput exceeded → SDK retries with exponential backoff automatically.

## Interview angle

!!! tip "When to mention backoff"
    Retry discussions — always pair retry with backoff + jitter. Also relevant when designing rate limiting responses.

**Key points:**
1. Exponential backoff is the baseline
2. Add full jitter to prevent thundering herd — this is the most important addition
3. Cap the maximum delay (don't wait forever)
4. Respect `Retry-After` headers from servers
5. Combine with circuit breaker for sustained failures

## Related topics

- [Retry & Timeout](retry-timeout.md) — backoff is part of the retry strategy
- [Circuit Breaker](circuit-breaker.md) — when to stop retrying entirely
- [Rate Limiting](rate-limiting.md) — backoff is the client response to being rate-limited
- [Backpressure](../messaging/backpressure.md) — system-level response to overload
