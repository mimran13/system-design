# Design a Rate Limiter

## Problem statement

Design a rate limiting service that can be used across a distributed system to:
- Limit each user to 100 API requests per minute
- Return HTTP 429 with `Retry-After` header when exceeded
- Work correctly across 50 API server instances
- Handle 50,000 requests/second total

## Clarifying questions

```
1. What are we limiting by? User ID, IP, API key, or endpoint?
   → User ID primarily; also per-IP for unauthenticated endpoints

2. What limits? Per minute? Burst vs sustained?
   → 100 req/min per user, with short burst tolerance (10 req/s)

3. Hard vs soft limit?
   → Hard: return 429, never exceed

4. Where does it run? In each service or as a standalone proxy?
   → Standalone service + library — services call the limiter

5. Consistency requirements? Can a user briefly exceed the limit?
   → Brief inconsistency acceptable (strong consistency too expensive)
```

## High-level design

```
Client → API Gateway → Rate Limiter (sidecar/middleware)
                              │
                              ▼
                        Redis Cluster
                       (sliding window counters)
```

**Decision: centralized Redis-based rate limiter**  
Each API server holds no local state. All servers check the same Redis. Consistent across all instances.

## Algorithm selection

**Sliding window counter** (recommended):
- Avoids burst at window boundary (unlike fixed window)
- Much lower memory than sliding window log
- Slightly approximate but acceptable for most use cases

```python
import redis
import time

r = redis.Redis(host='rate-limiter-redis', port=6379)

def is_allowed(user_id: str, limit: int = 100, window_seconds: int = 60) -> tuple[bool, dict]:
    now = int(time.time())
    window_start = now - window_seconds
    
    key = f"ratelimit:{user_id}"
    
    with r.pipeline() as pipe:
        # Remove old entries outside window
        pipe.zremrangebyscore(key, 0, window_start)
        # Count remaining in window
        pipe.zcard(key)
        # Add current request (score = timestamp for ordering)
        pipe.zadd(key, {f"{now}:{id(pipe)}": now})
        # Expire key after window (cleanup)
        pipe.expire(key, window_seconds + 1)
        results = pipe.execute()
    
    count = results[1]  # count before adding current request
    
    headers = {
        "X-RateLimit-Limit": str(limit),
        "X-RateLimit-Remaining": str(max(0, limit - count - 1)),
        "X-RateLimit-Reset": str(now + window_seconds),
    }
    
    if count >= limit:
        # Remove the just-added entry (rejected)
        r.zrem(key, f"{now}:{id(pipe)}")
        headers["Retry-After"] = str(window_seconds)
        return False, headers
    
    return True, headers
```

**Alternative: Token bucket with Lua script** (better for burst control):

```lua
-- Lua script: atomic check-and-decrement
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])  -- tokens per second
local now = tonumber(ARGV[3])

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1]) or capacity
local last_refill = tonumber(bucket[2]) or now

-- Add tokens based on time elapsed
local elapsed = now - last_refill
local new_tokens = math.min(capacity, tokens + elapsed * refill_rate)

if new_tokens >= 1 then
    redis.call('HMSET', key, 'tokens', new_tokens - 1, 'last_refill', now)
    redis.call('EXPIRE', key, 3600)
    return {1, math.floor(new_tokens - 1)}  -- allowed, remaining
else
    redis.call('HMSET', key, 'tokens', new_tokens, 'last_refill', now)
    return {0, 0}  -- denied
end
```

## Deep dive: distributed accuracy

**Problem:** With 50 servers, each server can make Redis calls independently, but Redis calls aren't free (0.5–1ms each). Options:

### Option 1: Synchronous Redis check (strong consistency)

```
Every request → Redis EVAL → allow/deny
Latency added: ~1ms
Accuracy: exact
```

Good for payment APIs, authentication endpoints.

### Option 2: Local token bucket + periodic Redis sync (high performance)

```
Each server keeps local token bucket (in-memory)
Every 100ms: sync with Redis (push local consumption, pull global state)

Allows brief over-limit (~100ms × rate = small burst)
Latency added: ~0ms (local check)
Use for: high-QPS endpoints where slight over-limit is acceptable
```

```python
from threading import Lock
import time

class LocalRateLimiter:
    def __init__(self, user_id: str, limit: int, window: int):
        self.user_id = user_id
        self.local_count = 0
        self.global_count = 0
        self.limit = limit
        self.last_sync = time.time()
        self.lock = Lock()
    
    def is_allowed(self) -> bool:
        with self.lock:
            self.local_count += 1
            # Sync every 100ms
            if time.time() - self.last_sync > 0.1:
                self._sync_with_redis()
            return self.global_count + self.local_count <= self.limit
    
    def _sync_with_redis(self):
        # Push local consumption to Redis, get global total
        global_count = redis_atomic_add(self.user_id, self.local_count)
        self.global_count = global_count
        self.local_count = 0
        self.last_sync = time.time()
```

### Option 3: API Gateway native rate limiting (simplest)

AWS API Gateway and AWS WAF have built-in rate limiting — no custom code needed for most use cases.

## Data model

```
Redis key: ratelimit:{user_id}:{window_start}
Value:     integer counter
TTL:       window duration + 1 second

For sliding window log:
Key: ratelimit:log:{user_id}
Type: Sorted Set
Member: {timestamp}:{request_id}
Score: timestamp
```

### Storage estimate

```
1M users × 1 key × ~200 bytes = 200 MB per window
Redis handles this easily (cluster if needed)
```

## Handling Redis failure

```python
def is_allowed_with_fallback(user_id: str) -> bool:
    try:
        return redis_rate_limit(user_id)
    except redis.RedisError:
        # Redis is down
        # Option 1: Fail open (allow all requests) — better for availability
        log.error("Rate limiter Redis unavailable, failing open")
        return True
        
        # Option 2: Fail closed (deny all requests) — better for capacity protection
        # return False
        
        # Option 3: Local fallback (approximate)
        # return local_fallback_limiter.is_allowed(user_id)
```

**Decision depends on use case:**
- Public API preventing abuse → fail closed or local fallback
- Internal service → fail open (don't cause cascading failures)

## Rate limit headers

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1714138200

HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1714138200
Retry-After: 23
Content-Type: application/json

{"error": "rate_limit_exceeded", "retry_after": 23}
```

## Multiple limit tiers

```python
RATE_LIMITS = {
    'free':       {'requests': 100,   'window': 60},
    'basic':      {'requests': 1000,  'window': 60},
    'pro':        {'requests': 10000, 'window': 60},
    'enterprise': {'requests': 100000,'window': 60},
}

# Also: per-endpoint limits
ENDPOINT_LIMITS = {
    '/auth/login':         {'requests': 5,   'window': 60},   # strict
    '/auth/password-reset':{'requests': 3,   'window': 3600}, # very strict
    '/search':             {'requests': 30,  'window': 60},   # moderate
    'default':             {'requests': 100, 'window': 60},
}

def get_limit(user: User, endpoint: str) -> dict:
    tier_limit = RATE_LIMITS[user.tier]
    endpoint_limit = ENDPOINT_LIMITS.get(endpoint, ENDPOINT_LIMITS['default'])
    # Apply the stricter of the two
    return min(tier_limit, endpoint_limit, key=lambda l: l['requests'])
```

## AWS architecture

```
Internet → CloudFront (edge rate limiting) → WAF (IP-based)
               ↓
         API Gateway (usage plans per API key: 1000 req/day)
               ↓
         Lambda / ECS (user-level rate limiting via Redis)
               ↓
         ElastiCache Redis Cluster (rate limit counters)
```

**AWS API Gateway usage plans:**
```python
# Built-in rate limiting per API key (no Redis needed for simple cases)
apigw.create_usage_plan(
    name='free-tier',
    throttle={'rateLimit': 10, 'burstLimit': 20},  # req/sec
    quota={'limit': 10000, 'period': 'MONTH'},
)
```

## Interview talking points

!!! tip "Key design decisions to discuss"
    1. Algorithm: sliding window counter for accuracy + memory efficiency
    2. Distributed state: Redis with Lua scripts for atomicity
    3. Consistency vs performance: synchronous (exact) vs async sync (fast)
    4. Failure mode: fail open vs closed — justify based on use case
    5. Response headers: always return X-RateLimit-* so clients can self-throttle

## Related topics

- [Rate Limiting](../patterns/rate-limiting.md) — algorithm deep dive
- [Token Bucket](../patterns/rate-limiting.md) — burst control algorithm
- [Redis](../storage/key-value-stores.md) — Lua scripts, atomic operations
- [API Gateway](../networking/api-gateway.md) — AWS built-in rate limiting
