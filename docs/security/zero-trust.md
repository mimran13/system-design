# Zero Trust Architecture

## What it is

Zero Trust is a security model based on the principle: **"Never trust, always verify."** Traditional security assumed everything inside the corporate network was safe. Zero Trust treats every request as potentially hostile, regardless of where it originates.

```
Traditional Perimeter Security ("Castle and Moat"):
  Outside network → untrusted (firewall blocks)
  Inside network  → trusted (can access anything)
  
  Problem: once attacker breaches perimeter → free reign
  Problem: employees, contractors, compromised devices inside = trusted
  Reality: most breaches are insider threats or lateral movement

Zero Trust:
  Every request must be authenticated
  Every request must be authorized for that specific action
  Every access is logged
  Access is granted with least privilege
  Trust is never assumed — always verified
```

## Core principles

### 1. Verify explicitly

Authenticate and authorize every request — no implicit trust based on network location:

```
Traditional: "This request came from our internal network → trust it"
Zero Trust:  "This request has valid mTLS cert + JWT with required scope → allow it"

Every request must present:
  ✓ Identity (who you are): JWT, mTLS certificate
  ✓ Authorization (what you can do): claims, scopes, policies
  ✓ Context (is this expected?): device health, location, time
```

### 2. Use least privilege

Grant minimum access required for the specific operation:

```
Traditional RBAC role: "admin" → access to everything
Zero Trust: "order-service" → read/write orders, read products, no access to users

Access scope tied to:
  - Identity (service, user)
  - Resource (specific data/action)
  - Time (session duration, just-in-time access)
  - Context (device compliance status, IP range)
```

### 3. Assume breach

Design as if attackers are already inside:

```
All internal traffic encrypted (mTLS)
Lateral movement blocked (micro-segmentation)
Audit logs for all access (immutable)
Circuit breakers detect abnormal patterns
Database access requires authentication (not just network access)
```

## Zero Trust for microservices

### Service identity with mTLS

Each service has a cryptographic identity (certificate). Service A proves its identity to Service B:

```
Istio / Envoy sidecar model:
  
  [Order Service] → [Envoy sidecar] ─mTLS─► [Envoy sidecar] → [Payment Service]
  
  Sidecar handles:
    - Certificate issuance from Istio CA (SPIFFE identity)
    - mTLS termination (service code doesn't manage certs)
    - Authorization policy enforcement
    - Audit logging
```

```yaml
# Istio AuthorizationPolicy: order-service can only call payment-service on /charge
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: payment-service-policy
  namespace: production
spec:
  selector:
    matchLabels:
      app: payment-service
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/production/sa/order-service"]
      to:
        - operation:
            methods: ["POST"]
            paths: ["/charge", "/refund"]
```

```yaml
# PeerAuthentication: require mTLS for all traffic in namespace
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: production
spec:
  mtls:
    mode: STRICT  # reject any non-mTLS connection
```

### SPIFFE (Secure Production Identity Framework)

Standard for workload identity in Zero Trust:

```
SPIFFE Identity (SPIRE):
  spiffe://cluster.local/ns/production/sa/order-service
  
  → Each pod/service gets a cryptographic certificate with this URI
  → Certificates rotate automatically (short-lived: hours)
  → Other services verify the SPIFFE ID, not just "is this internal traffic?"
```

## Zero Trust network architecture

```
Internet
   │
   ▼
Identity-Aware Proxy (IAP)
   │
   ├── Verify: Who is the user? (OIDC/JWT)
   ├── Verify: Is device compliant? (MDM enrolled, patched)
   ├── Verify: Is this normal behavior? (time, location, risk score)
   │
   ▼
Application (no VPN required for users)
   │
   ▼
Service Mesh (mTLS between all services)
   │
   ├── Order Service    (SPIFFE identity, per-service policies)
   ├── Payment Service  (SPIFFE identity, per-service policies)
   └── User Service     (SPIFFE identity, per-service policies)
   │
   ▼
Data Layer
   ├── Each service has its own DB credentials (not shared)
   ├── Credentials rotated automatically (Vault/Secrets Manager)
   └── Column-level encryption for sensitive data
```

## AWS Zero Trust components

### AWS Identity-Aware Proxy (IAP equivalent)

```python
# AWS Verified Access: Zero Trust access without VPN
# Users authenticate with SSO, device compliance checked, then get access

# For API Gateway:
# Cognito User Pool → JWT → Lambda authorizer → per-action ABAC

async def lambda_authorizer(event: dict, context) -> dict:
    token = event['headers'].get('Authorization', '').replace('Bearer ', '')
    
    try:
        # Verify JWT
        claims = verify_jwt(token)
        
        # Check device compliance (e.g., via device management attribute in token)
        if not claims.get('device_compliant'):
            return deny_policy()
        
        # Generate IAM policy for this user's allowed actions
        return {
            "principalId": claims['sub'],
            "policyDocument": {
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Action": "execute-api:Invoke",
                    "Resource": build_resource_arns(claims['permissions']),
                }]
            },
            "context": {
                "user_id": claims['sub'],
                "role": claims['role'],
            }
        }
    except Exception:
        return deny_policy()
```

### IAM Zero Trust for services

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "dynamodb:GetItem",
      "Resource": "arn:aws:dynamodb:us-east-1:123:table/orders",
      "Condition": {
        "ForAllValues:StringEquals": {
          "dynamodb:Attributes": ["id", "status", "user_id"]
        },
        "StringEquals": {
          "dynamodb:LeadingKeys": "${aws:PrincipalTag/user_id}"
        }
      }
    }
  ]
}
```

Users can only read their own DynamoDB rows, and only specific attributes.

### VPC micro-segmentation

```yaml
# Security Groups as micro-segmentation
# Only order-service SG can reach payment-service SG on port 8080
Resources:
  OrderServiceSG:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Order Service
      VpcId: !Ref VpcId
  
  PaymentServiceSG:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Payment Service
      VpcId: !Ref VpcId
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 8080
          ToPort: 8080
          SourceSecurityGroupId: !Ref OrderServiceSG
          # Only order-service can reach payment-service
          # Not: "all internal traffic"
```

## Just-in-Time (JIT) access

Eliminate standing privileged access — grant access only when needed:

```python
# AWS Systems Manager Session Manager for JIT shell access
# No permanent SSH access, no bastion hosts

# Request access:
ssm = boto3.client('ssm')
session = ssm.start_session(
    Target='i-1234567890abcdef0',  # EC2 instance ID
    # SSM validates IAM permissions before granting session
)

# Session is logged, audited, and can be terminated
# No inbound ports required on EC2
```

**For database access:**
```
Instead of: DBA has permanent DB password with admin access
Zero Trust: 
  DBA requests access via Vault/PAM
  System verifies: is this person authorized for this DB? for this reason?
  Vault issues short-lived DB credentials (5-minute TTL)
  DBA uses credentials → all queries logged
  Credentials expire automatically
```

## Continuous verification

Trust is not granted once at login — it's continuously re-evaluated:

```python
# Re-evaluate access on sensitive operations
class ZeroTrustContext:
    def __init__(self, user_id: str, ip: str, device_id: str):
        self.user_id = user_id
        self.ip = ip
        self.device_id = device_id
        self.risk_score = self._calculate_risk()
    
    def _calculate_risk(self) -> float:
        score = 0.0
        
        # High-risk signals
        if self._is_unusual_location():
            score += 0.4
        if self._is_unusual_time():
            score += 0.2
        if not self._is_device_compliant():
            score += 0.3
        if self._is_velocity_anomaly():  # too many requests
            score += 0.3
        
        return min(score, 1.0)
    
    def require_step_up_auth(self, operation_risk: float) -> bool:
        """Require re-authentication for high-risk operations"""
        return self.risk_score + operation_risk > 0.7

# Usage
ctx = ZeroTrustContext(user_id, ip, device_id)

# Normal read: no step-up needed
if ctx.require_step_up_auth(operation_risk=0.1):
    raise HTTPException(401, "Please re-authenticate")

# Large transfer: might require step-up
if ctx.require_step_up_auth(operation_risk=0.5):
    return {"action": "mfa_required", "reason": "high_risk_operation"}
```

## Zero Trust vs VPN

| | VPN | Zero Trust |
|---|---|---|
| **Trust model** | Trust the network | Trust the identity |
| **Access scope** | Full network access | Per-application/resource |
| **User experience** | Slow, requires client | Browser-native |
| **Security** | Lateral movement possible | Micro-segmented |
| **Scale** | VPN concentrator bottleneck | Distributed verification |
| **Visibility** | Limited per-app logging | Full audit trail |

**VPN is still useful for:** legacy systems that can't be modified, OT/industrial systems, regulatory requirements.

## Interview angle

!!! tip "What interviewers are testing"
    Zero Trust comes up in "how do you secure a microservices environment?"

**Strong answer pattern:**
1. Zero Trust = "never trust, always verify" — no implicit trust from network location
2. mTLS for service-to-service — each service has a cryptographic identity (SPIFFE)
3. Least privilege per service — security groups + IAM policies, not "internal = trusted"
4. Audit everything — all access logged, anomalies trigger step-up auth
5. On AWS: VPC security groups for network micro-segmentation, IAM roles per service, Verified Access for user access

## Related topics

- [Encryption](encryption.md) — mTLS and data encryption in Zero Trust
- [Authentication & Authorization](authn-authz.md) — identity is the Zero Trust perimeter
- [Service Mesh](../infrastructure/service-mesh.md) — Istio implements Zero Trust for services
- [Secrets Management](secrets-management.md) — credential management in Zero Trust
