# Authentication and Authorization

## The distinction

```
Authentication (AuthN): Who are you?
  → "I am Alice, employee #1234"
  → Verified via password, token, certificate, biometric

Authorization (AuthZ): What are you allowed to do?
  → "Alice can read orders, but not cancel them"
  → Checked after authentication succeeds

You can be authenticated but not authorized:
  → Logged in to Stripe but tried to access another company's data
  → HTTP 401 = not authenticated; HTTP 403 = authenticated but not authorized
```

## Authentication mechanisms

### Password-based

The baseline. Weakest option — phishing, brute force, credential stuffing.

```python
import bcrypt

# Registration: hash password
def register_user(email: str, password: str) -> User:
    # Cost factor 12: ~250ms on modern hardware (brute force barrier)
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12))
    return db.create_user(email=email, password_hash=hashed.decode())

# Login: verify password
def login(email: str, password: str) -> Optional[User]:
    user = db.find_user(email=email)
    if user is None:
        # Timing attack prevention: still run bcrypt even if user not found
        bcrypt.checkpw(password.encode(), b"$2b$12$notarealhashjustfiller.............")
        return None
    
    if not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
        return None
    
    return user
```

**Never store:** plaintext passwords, MD5/SHA1 hashes.  
**Always use:** bcrypt, scrypt, or Argon2 with appropriate cost factors.

### Multi-Factor Authentication (MFA)

Second factor eliminates stolen password attacks:

```
Factors:
  Something you know:  password, PIN
  Something you have:  TOTP app (Authenticator), hardware key (YubiKey), SMS
  Something you are:   fingerprint, face ID

TOTP (Time-based One-Time Password):
  1. Setup: server generates secret, user scans QR code into Authenticator app
  2. Login: app computes TOTP = HMAC-SHA1(secret, time/30) mod 10^6
  3. Server: computes same TOTP, verifies match (30s window)
```

```python
import pyotp

# Setup: generate secret for user
secret = pyotp.random_base32()  # store encrypted in DB
totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
    name=user.email,
    issuer_name="MyApp"
)
# Render totp_uri as QR code for user to scan

# Verify: check code entered by user
def verify_totp(user: User, code: str) -> bool:
    totp = pyotp.TOTP(user.totp_secret)
    return totp.verify(code, valid_window=1)  # ±30s tolerance
```

### Session-based authentication

Traditional web pattern: server stores session state, client holds session ID cookie.

```python
import secrets
from datetime import datetime, timedelta

# Login: create session
def login_and_create_session(user: User, response: Response) -> None:
    session_id = secrets.token_urlsafe(32)
    
    # Store session in Redis (expires automatically)
    redis.setex(
        f"session:{session_id}",
        timedelta(hours=24),
        json.dumps({"user_id": user.id, "created_at": datetime.utcnow().isoformat()})
    )
    
    # Set cookie
    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,     # JavaScript can't read it (XSS protection)
        secure=True,       # HTTPS only
        samesite="strict", # CSRF protection
        max_age=86400,
    )

# Request: validate session
async def get_current_user(session_id: str = Cookie(None)) -> User:
    if not session_id:
        raise HTTPException(401, "Not authenticated")
    
    session_data = redis.get(f"session:{session_id}")
    if not session_data:
        raise HTTPException(401, "Session expired")
    
    session = json.loads(session_data)
    return db.get_user(session["user_id"])

# Logout: invalidate session
def logout(session_id: str) -> None:
    redis.delete(f"session:{session_id}")
```

**Session properties:**
- Stateful on server (stored in Redis/DB)
- Easy to invalidate (delete from Redis)
- Vulnerable to CSRF without `samesite` cookie attribute
- Requires sticky sessions or shared session store for horizontal scaling

## Authorization models

### Role-Based Access Control (RBAC)

Users are assigned roles; roles have permissions:

```python
from enum import Enum

class Role(Enum):
    CUSTOMER = "customer"
    SUPPORT = "support"
    ADMIN = "admin"

# Permission matrix
PERMISSIONS = {
    Role.CUSTOMER: {
        "orders.read.own",       # own orders only
        "orders.create",
        "profile.update.own",
    },
    Role.SUPPORT: {
        "orders.read.all",       # all orders
        "orders.cancel",
        "users.read",
    },
    Role.ADMIN: {
        "orders.read.all",
        "orders.cancel",
        "orders.refund",
        "users.read",
        "users.update",
        "users.delete",
    }
}

def has_permission(user: User, permission: str) -> bool:
    return permission in PERMISSIONS.get(user.role, set())

# FastAPI dependency
def require_permission(permission: str):
    async def check(user: User = Depends(get_current_user)):
        if not has_permission(user, permission):
            raise HTTPException(403, f"Missing permission: {permission}")
        return user
    return check

@app.get("/orders")
async def list_all_orders(user = Depends(require_permission("orders.read.all"))):
    return await order_service.get_all()
```

### Attribute-Based Access Control (ABAC)

More flexible — decisions based on attributes of user, resource, and environment:

```python
from dataclasses import dataclass
from typing import Any

@dataclass
class AccessRequest:
    subject: dict    # user attributes
    resource: dict   # resource attributes
    action: str
    environment: dict  # time, IP, etc.

class ABACPolicyEngine:
    def evaluate(self, request: AccessRequest) -> bool:
        # Policy: support agents can view orders from their region only
        if request.action == "orders.read":
            if request.subject["role"] == "support":
                return (
                    request.subject["region"] == request.resource["region"]
                    or request.subject["role"] == "admin"
                )
        
        # Policy: customers can only access their own resources
        if request.subject["role"] == "customer":
            return request.resource.get("owner_id") == request.subject["user_id"]
        
        return request.subject["role"] == "admin"

engine = ABACPolicyEngine()

async def get_order(order_id: str, current_user: User = Depends(get_current_user)):
    order = await order_service.get(order_id)
    
    decision = engine.evaluate(AccessRequest(
        subject={"user_id": current_user.id, "role": current_user.role, "region": current_user.region},
        resource={"owner_id": order.user_id, "region": order.region},
        action="orders.read",
        environment={"ip": request.client.host},
    ))
    
    if not decision:
        raise HTTPException(403)
    return order
```

### Policy as Code (OPA - Open Policy Agent)

Externalize authorization policies from application code:

```rego
# policy.rego (Open Policy Agent)
package orders.authz

default allow = false

# Admins can do anything
allow {
    input.user.role == "admin"
}

# Customers can read their own orders
allow {
    input.action == "orders.read"
    input.user.role == "customer"
    input.resource.owner_id == input.user.id
}

# Support can read all orders from their region
allow {
    input.action == "orders.read"
    input.user.role == "support"
    input.user.region == input.resource.region
}
```

```python
import requests

def check_authorization(user: dict, resource: dict, action: str) -> bool:
    response = requests.post(
        "http://opa-service:8181/v1/data/orders/authz/allow",
        json={"input": {"user": user, "resource": resource, "action": action}}
    )
    return response.json().get("result", False)
```

## Common vulnerabilities

### Broken Access Control (OWASP #1)

```python
# VULNERABLE: Trust client-provided user_id
@app.get("/orders/{order_id}")
async def get_order(order_id: str, user_id: str = Query(...)):
    # Anyone can pass any user_id!
    return await db.get_order(order_id, user_id=user_id)

# SECURE: Get user from validated session/token
@app.get("/orders/{order_id}")
async def get_order(order_id: str, current_user: User = Depends(get_current_user)):
    order = await db.get_order(order_id)
    if order.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(403)
    return order
```

### IDOR (Insecure Direct Object Reference)

```python
# VULNERABLE: Sequential IDs allow enumeration
GET /orders/1001  → your order
GET /orders/1002  → someone else's order (returns it!)

# SECURE: Check ownership on every resource access
async def get_order(order_id: str, current_user: User = Depends(get_current_user)):
    order = await db.get_order(order_id)
    if order is None:
        raise HTTPException(404)  # Don't reveal existence
    if order.user_id != current_user.id:
        raise HTTPException(404)  # 404, not 403 (don't reveal existence to attackers)
    return order
```

### Privilege escalation

```python
# VULNERABLE: User can modify their own role
@app.put("/users/{user_id}")
async def update_user(user_id: str, updates: UserUpdate, current_user = Depends(get_current_user)):
    # No check on what's being updated!
    return await db.update_user(user_id, updates.dict())

# SECURE: Only admins can change roles
@app.put("/users/{user_id}")
async def update_user(user_id: str, updates: UserUpdate, current_user = Depends(get_current_user)):
    if updates.role is not None and current_user.role != "admin":
        raise HTTPException(403, "Cannot change role")
    
    if user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "Cannot update other users")
    
    return await db.update_user(user_id, updates.dict(exclude_unset=True))
```

## AWS IAM

AWS uses policy-based authorization for all service access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::my-order-attachments/*",
      "Condition": {
        "StringEquals": {
          "s3:prefix": "${aws:PrincipalTag/user_id}/"
        }
      }
    },
    {
      "Effect": "Deny",
      "Action": "s3:DeleteObject",
      "Resource": "*"
    }
  ]
}
```

**IAM principles:**
- Least privilege: grant only what's needed
- Use IAM roles (not access keys) for EC2/Lambda/ECS
- Use permission boundaries to limit max permissions
- Enable MFA for all human IAM users

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you understand that authentication and authorization are separate concerns, each with multiple implementation choices.

**Strong answer pattern:**
1. AuthN = who you are (JWT/session), AuthZ = what you can do (RBAC/ABAC)
2. Never trust client-provided identity — validate from token/session on every request
3. IDOR is the #1 access control bug — always check ownership in your DB query
4. Return 404 (not 403) when user shouldn't know a resource exists
5. IAM roles (not access keys) for AWS services — least privilege always

## Related topics

- [OAuth & JWT](oauth-jwt.md) — token-based authentication
- [API Security](api-security.md) — authentication in API design
- [Zero Trust](zero-trust.md) — never trust, always verify
- [Secrets Management](secrets-management.md) — storing credentials safely
