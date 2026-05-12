# Retry & Timeout

## You'll see this when...

- A request that "should be quick" hangs for 30+ seconds
- One transient network blip caused permanent failure (no retry)
- Threads piling up waiting for downstream → thread pool exhaustion
- Brief outage triggered a retry storm that prolonged the outage
- Code uses default HTTP client (no explicit timeout — usually unbounded)
- AWS SDK retries hidden inside the library; you didn't configure them
- Logs show "context deadline exceeded" or "DeadlineExceeded" (gRPC)
- A `retry()` decorator was added without backoff — caused thundering herd

## Timeouts

A timeout limits how long a caller waits for a response. Without timeouts, a slow downstream causes the caller to block indefinitely, exhausting thread pools and causing cascade failures.

### Types of timeouts

**Connection timeout:** How long to wait for a TCP connection to be established.
```
Connection timeout = 1-3 seconds (network should connect fast)
If exceeded: likely firewall, wrong host, or network issue
```

**Request timeout (read timeout):** How long to wait for a response after connection is established.
```
Request timeout = based on expected response time × safety margin
If 95th percentile is 200ms, set timeout to 500-1000ms
```

**Socket idle timeout:** How long to keep an idle connection in the pool.

```python
import requests

response = requests.get(
    'http://payment-service/charge',
    timeout=(3, 10)  # (connection_timeout, read_timeout) in seconds
)
```

### Setting timeout values

```
Too short: legitimate slow requests fail (user sees error)
Too long: threads tied up, cascade failure when downstream is slow
```

**Methodology:**
1. Measure P99 response time of the dependency
2. Set timeout to P99 × 1.5-2x (allows for variance)
3. Monitor timeout rate — if too high, investigate slowness

**Cascading timeout:** Set downstream timeout < upstream timeout to preserve response time budget:

```
User → API (timeout: 1000ms)
  → Order Service (timeout: 800ms)
    → Payment Service (timeout: 600ms)
      → DB (timeout: 400ms)

If DB is slow, Payment times out before Order, which times out before API
Response chain unwinds within user's 1000ms budget
```

## Retries

Retrying failed requests handles transient failures — network blips, brief overloads, rolling restarts.

### What to retry

| Error type | Retry? | Why |
|---|---|---|
| Network timeout | Yes | Likely transient |
| 503 Service Unavailable | Yes | Upstream temporarily overloaded |
| 429 Too Many Requests | Yes (after delay) | Rate limited |
| 500 Internal Server Error | Careful | Depends on idempotency |
| 400 Bad Request | Never | Client error — retrying won't help |
| 404 Not Found | Never | Resource doesn't exist |
| Connection refused | Yes | Service restarting |
| Duplicate key (DB) | Never | Non-idempotent insert |

**Golden rule:** Only retry if the operation is **idempotent** or the error is clearly not due to the operation completing.

### Exponential backoff

Don't retry immediately — you'd hammer an already-struggling service:

```python
import time
import random

def retry_with_backoff(func, max_retries=5, base_delay=0.1):
    for attempt in range(max_retries):
        try:
            return func()
        except RetryableError as e:
            if attempt == max_retries - 1:
                raise  # exhausted retries
            
            # Exponential backoff: 0.1s, 0.2s, 0.4s, 0.8s, 1.6s
            delay = base_delay * (2 ** attempt)
            
            # Jitter: add randomness to spread retries
            # Without jitter: all clients retry at same time → thundering herd
            jitter = random.uniform(0, delay * 0.1)
            
            time.sleep(delay + jitter)
    
    raise MaxRetriesExceeded()
```

### Jitter strategies

```
No jitter:           0.1, 0.2, 0.4, 0.8, 1.6, 3.2
                     Multiple clients retry in sync → overload spikes

Full jitter:         random(0, cap)  → too spread out, slow convergence
Equal jitter:        cap/2 + random(0, cap/2)  → bounded randomness
Decorrelated jitter: sleep = random(base, min(cap, sleep * 3))  → AWS recommendation
```

**AWS recommendation (decorrelated jitter):**
```python
cap = 30         # max delay seconds
base = 0.1       # initial delay
sleep = base

for attempt in range(max_retries):
    # ...
    sleep = min(cap, random.uniform(base, sleep * 3))
    time.sleep(sleep)
```

### Retry budget

Unlimited retries amplify failure:

```
100 clients × 5 retries each = 500 requests to failing service
Service under 5x normal load — makes it harder to recover

Retry budget: global limit on total retries per unit time
  Max 10% of requests can be retries
  If retry rate > 10% → stop retrying, fail fast
```

### Hedged requests

Send the same request to two servers and use whichever responds first:

```python
async def hedged_request(url):
    task1 = asyncio.create_task(http.get(f"{server1}{url}"))
    
    # If first request takes > P95 latency (100ms), send second
    await asyncio.sleep(0.1)
    task2 = asyncio.create_task(http.get(f"{server2}{url}"))
    
    done, pending = await asyncio.wait(
        [task1, task2], return_when=asyncio.FIRST_COMPLETED
    )
    
    # Cancel the losing request
    for task in pending:
        task.cancel()
    
    return done.pop().result()
```

Reduces tail latency: if 1% of requests are slow, hedging eliminates most of the P99.

## Combined resilience strategy

```python
from resilience4j import CircuitBreaker, Retry, TimeLimiter, Bulkhead

@CircuitBreaker(name="payment", failureRateThreshold=50)
@Retry(name="payment", maxAttempts=3, waitDuration=100, retryOnResult=lambda r: r.status_code == 503)
@TimeLimiter(name="payment", timeoutDuration=2000)
@Bulkhead(name="payment", maxConcurrentCalls=10)
def charge_payment(amount):
    return payment_client.charge(amount)
```

**Order matters:**
```
Bulkhead (limit concurrent) 
  → CircuitBreaker (fail-fast if open) 
    → TimeLimiter (set timeout) 
      → Retry (on failure)
```

## AWS SDK retry behavior

AWS SDKs retry by default:

```python
import boto3
from botocore.config import Config

config = Config(
    retries={
        'max_attempts': 5,
        'mode': 'adaptive'  # 'legacy' | 'standard' | 'adaptive'
    },
    connect_timeout=3,
    read_timeout=30
)

client = boto3.client('dynamodb', config=config)
```

**Retry modes:**
- `legacy`: exponential backoff on throttling
- `standard`: standardized retry logic
- `adaptive`: adds client-side rate limiting (best for burst scenarios)

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you design for transient failure — not just the happy path.

**Strong answer pattern:**
1. Set timeouts on every external call — never block indefinitely
2. Retry only idempotent operations with exponential backoff + jitter
3. Implement retry budget — prevent retry storms from amplifying failures
4. Combine: Bulkhead (isolation) + CircuitBreaker (fail-fast) + Retry (transient) + Timeout (bound wait)
5. Monitor timeout rate and retry rate as SLIs

## Related topics

- [Circuit Breaker](circuit-breaker.md) — stop retrying when sustained failures detected
- [Bulkhead](bulkhead.md) — isolate concurrent calls
- [Backpressure](../messaging/backpressure.md) — system-level retry control
- [Idempotency](idempotency.md) — required for safe retries
