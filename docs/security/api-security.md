# API Security

## What it is

API security is the set of practices that protect APIs from unauthorized access, abuse, and attacks. APIs are the attack surface of modern applications — every endpoint is a potential entry point.

## OWASP API Security Top 10

The most critical API vulnerabilities:

| Rank | Vulnerability | Example |
|---|---|---|
| API1 | Broken Object Level Authorization (BOLA/IDOR) | `GET /orders/123` returns another user's order |
| API2 | Broken Authentication | Weak tokens, no expiry, credentials in URL |
| API3 | Broken Object Property Level Auth | User can modify `role` field in their own profile |
| API4 | Unrestricted Resource Consumption | No rate limiting, can DoS with large requests |
| API5 | Broken Function Level Authorization | Regular user hits admin endpoint |
| API6 | Unrestricted Access to Sensitive Business Flows | Scraping product catalog, bulk account creation |
| API7 | Server-Side Request Forgery (SSRF) | API fetches attacker-controlled URL → internal network |
| API8 | Security Misconfiguration | Debug endpoints live, overly permissive CORS |
| API9 | Improper Inventory Management | Forgotten v1 API still running, no auth |
| API10 | Unsafe Consumption of APIs | Trusting third-party API data without validation |

## Input validation

**Never trust client input.** Validate at the API boundary before any processing:

```python
from pydantic import BaseModel, Field, validator, EmailStr
from typing import Optional
import re

class CreateOrderRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=50, pattern=r'^usr_[a-z0-9]+$')
    items: list["OrderItem"] = Field(..., min_items=1, max_items=100)
    promo_code: Optional[str] = Field(None, max_length=50)
    
    @validator('promo_code')
    def sanitize_promo_code(cls, v):
        if v is None:
            return v
        # Only alphanumeric and hyphens
        if not re.match(r'^[A-Z0-9\-]+$', v.upper()):
            raise ValueError('Invalid promo code format')
        return v.upper()

class OrderItem(BaseModel):
    product_id: str = Field(..., pattern=r'^p_[a-z0-9]+$')
    quantity: int = Field(..., ge=1, le=999)  # 1 to 999

# FastAPI automatically validates and returns 422 on violation
@app.post("/orders")
async def create_order(body: CreateOrderRequest):
    # body is guaranteed valid by this point
    ...
```

### SQL injection prevention

**Never use string interpolation for SQL.** Always use parameterized queries:

```python
# VULNERABLE: SQL injection
user_id = request.query_params.get("user_id")
cursor.execute(f"SELECT * FROM orders WHERE user_id = '{user_id}'")
# Attacker sends: user_id = ' OR '1'='1
# Query becomes: WHERE user_id = '' OR '1'='1' → returns ALL orders

# SECURE: Parameterized query
cursor.execute("SELECT * FROM orders WHERE user_id = $1", [user_id])
# Or with SQLAlchemy ORM (automatically parameterized)
orders = session.query(Order).filter(Order.user_id == user_id).all()
```

### Command injection prevention

```python
# VULNERABLE: Shell injection
filename = request.query_params.get("filename")
os.system(f"convert {filename} output.jpg")
# Attacker: filename="; rm -rf /; echo "

# SECURE: Never use shell=True with user input
import subprocess
# Validate input first
if not re.match(r'^[a-zA-Z0-9_\-\.]+$', filename):
    raise HTTPException(400, "Invalid filename")
subprocess.run(["convert", filename, "output.jpg"], shell=False, timeout=30)
```

### XSS prevention (for APIs serving HTML or embedding in responses)

```python
import html

# If API output is ever rendered in HTML
def safe_output(user_input: str) -> str:
    return html.escape(user_input)

# For JSON APIs: Content-Type: application/json prevents browser from rendering as HTML
# Always set: Content-Type: application/json; charset=utf-8
```

## Authentication on every endpoint

```python
# WRONG: assume routes are protected by default
@app.get("/admin/users")  # forgot to add auth dependency!
async def list_users():
    return await db.get_all_users()

# RIGHT: explicit auth dependency on every protected endpoint
@app.get("/admin/users")
async def list_users(current_user: User = Depends(require_admin)):
    return await db.get_all_users()

# Or: use a router with default dependencies
admin_router = APIRouter(
    prefix="/admin",
    dependencies=[Depends(require_admin)]  # applies to ALL routes in this router
)

@admin_router.get("/users")   # automatically requires admin
async def list_users():
    return await db.get_all_users()

@admin_router.delete("/users/{id}")  # automatically requires admin
async def delete_user(id: str):
    ...

app.include_router(admin_router)
```

## Rate limiting

Prevent abuse, DoS, and credential stuffing:

```python
import time
from fastapi import Request, HTTPException

# Simple in-memory rate limiter (use Redis in production)
from collections import defaultdict
import threading

class RateLimiter:
    def __init__(self, requests_per_minute: int):
        self.rpm = requests_per_minute
        self.windows = defaultdict(list)
        self.lock = threading.Lock()
    
    def is_allowed(self, key: str) -> bool:
        now = time.time()
        window_start = now - 60
        
        with self.lock:
            # Remove old requests
            self.windows[key] = [t for t in self.windows[key] if t > window_start]
            
            if len(self.windows[key]) >= self.rpm:
                return False
            
            self.windows[key].append(now)
            return True

limiter = RateLimiter(requests_per_minute=60)

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Key by IP (or better: by user ID when authenticated)
    client_ip = request.client.host
    
    if not limiter.is_allowed(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={
                "Retry-After": "60",
                "X-RateLimit-Limit": "60",
                "X-RateLimit-Reset": str(int(time.time()) + 60),
            }
        )
    
    return await call_next(request)
```

Different limits for different endpoint sensitivities:

```python
# Login endpoint: strict (prevents brute force)
login_limiter = RateLimiter(requests_per_minute=5)

# General API: standard
api_limiter = RateLimiter(requests_per_minute=100)

# Password reset: very strict
reset_limiter = RateLimiter(requests_per_minute=3)
```

## HTTPS / TLS

**Never serve APIs over plain HTTP in production.**

```nginx
# Nginx: redirect HTTP to HTTPS
server {
    listen 80;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    
    ssl_certificate /etc/ssl/certs/example.com.crt;
    ssl_certificate_key /etc/ssl/private/example.com.key;
    
    # Modern TLS only
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # HSTS: tell browsers to always use HTTPS (for 1 year)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Remove server version from headers
    server_tokens off;
}
```

## CORS (Cross-Origin Resource Sharing)

Control which origins can call your API from a browser:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    # WRONG: allow all origins
    # allow_origins=["*"],  # never for authenticated APIs
    
    # RIGHT: explicit allowed origins
    allow_origins=[
        "https://app.example.com",
        "https://admin.example.com",
    ],
    allow_credentials=True,    # required for cookies/auth headers
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=86400,  # cache preflight for 24h
)
```

**CORS misconception:** CORS is enforced by the browser, not the server. It doesn't protect against server-to-server calls or curl. It only protects against cross-origin requests from browsers.

## Security headers

```python
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'none'"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=()"
    
    # Remove information-leaking headers
    response.headers.pop("Server", None)
    response.headers.pop("X-Powered-By", None)
    
    return response
```

## SSRF (Server-Side Request Forgery)

Attackers trick your server into making requests to internal resources:

```python
# VULNERABLE: Fetch user-provided URL
@app.post("/fetch")
async def fetch_url(url: str):
    response = httpx.get(url)  # attacker provides http://169.254.169.254/ (AWS metadata!)
    return response.text

# SECURE: Validate and restrict URLs
import ipaddress
from urllib.parse import urlparse

ALLOWED_DOMAINS = {"trusted-partner.com", "cdn.example.com"}

def is_safe_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        
        # Only HTTPS
        if parsed.scheme != "https":
            return False
        
        # Only allowed domains
        if parsed.hostname not in ALLOWED_DOMAINS:
            return False
        
        # Block private IPs
        try:
            ip = ipaddress.ip_address(parsed.hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                return False
        except ValueError:
            pass  # it's a hostname, not an IP — DNS will resolve it
        
        return True
    except Exception:
        return False

@app.post("/fetch")
async def fetch_url(url: str):
    if not is_safe_url(url):
        raise HTTPException(400, "URL not allowed")
    response = httpx.get(url, timeout=5.0)
    return response.text
```

## Sensitive data in responses

```python
class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    created_at: datetime
    # Deliberately NOT included:
    # password_hash: str
    # totp_secret: str
    # credit_card_number: str

class AdminUserResponse(UserResponse):
    role: str
    internal_notes: str
    # Additional fields for admin view only

@app.get("/users/{id}")
async def get_user(id: str, current_user: User = Depends(get_current_user)):
    user = await db.get_user(id)
    
    if current_user.role == "admin":
        return AdminUserResponse.from_orm(user)
    
    # Regular users: limited view, own profile only
    if user.id != current_user.id:
        raise HTTPException(403)
    return UserResponse.from_orm(user)
```

## API key management

For service-to-service or developer API access:

```python
import secrets
import hashlib

def generate_api_key() -> tuple[str, str]:
    """Returns (raw_key, hashed_key). Store only hashed_key."""
    raw_key = f"sk_{secrets.token_urlsafe(32)}"  # prefix makes it identifiable
    hashed_key = hashlib.sha256(raw_key.encode()).hexdigest()
    return raw_key, hashed_key

# On key creation: return raw_key to user once, store only hash
raw_key, hashed = generate_api_key()
await db.store_api_key(
    user_id=user.id,
    key_hash=hashed,
    key_prefix=raw_key[:8],  # store prefix for display ("sk_abc123...")
    name="Production Key",
    permissions=["orders:read", "orders:write"],
)

# On each API request
async def verify_api_key(authorization: str = Header(None)) -> ApiKey:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing API key")
    
    raw_key = authorization[7:]
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    
    api_key = await db.find_api_key_by_hash(key_hash)
    if api_key is None or api_key.revoked:
        raise HTTPException(401, "Invalid API key")
    
    # Update last_used_at (async, don't block the request)
    background_tasks.add_task(db.update_last_used, api_key.id)
    
    return api_key
```

## AWS WAF

Web Application Firewall — filter malicious requests before they reach your API:

```yaml
# AWS WAF rules via CloudFormation/CDK
Resources:
  ApiWafAcl:
    Type: AWS::WAFv2::WebACL
    Properties:
      Scope: REGIONAL
      DefaultAction:
        Allow: {}
      Rules:
        # AWS managed rules: SQLi, XSS, known bad IPs
        - Name: AWSManagedRulesCommonRuleSet
          Priority: 1
          OverrideAction: { None: {} }
          Statement:
            ManagedRuleGroupStatement:
              VendorName: AWS
              Name: AWSManagedRulesCommonRuleSet
          VisibilityConfig:
            SampledRequestsEnabled: true
            CloudWatchMetricsEnabled: true
            MetricName: CommonRuleSet
        
        # Rate limiting: 1000 requests per 5 min per IP
        - Name: RateLimitRule
          Priority: 2
          Action:
            Block: {}
          Statement:
            RateBasedStatement:
              Limit: 1000
              AggregateKeyType: IP
          VisibilityConfig:
            SampledRequestsEnabled: true
            CloudWatchMetricsEnabled: true
            MetricName: RateLimit
```

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you treat security as a design concern, not an afterthought.

**Strong answer pattern:**
1. BOLA/IDOR — always check resource ownership server-side, not just auth
2. Input validation at the boundary — Pydantic/schema validation, parameterized queries
3. Rate limiting — different limits for sensitive endpoints (login, password reset)
4. HTTPS + HSTS everywhere — redirect HTTP, set HSTS header
5. Minimal response data — strip sensitive fields from API responses
6. AWS WAF + API Gateway — managed protection layer before your code

## Related topics

- [Authentication & Authorization](authn-authz.md) — authN/authZ fundamentals
- [OAuth & JWT](oauth-jwt.md) — token-based auth
- [Rate Limiting](../patterns/rate-limiting.md) — rate limiting algorithms
- [API Gateway](../networking/api-gateway.md) — centralized API security layer
- [Zero Trust](zero-trust.md) — security model for microservices
