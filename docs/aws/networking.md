# AWS Networking

## VPC (Virtual Private Cloud)

Your isolated network within AWS. Every resource lives in a VPC.

```
VPC: 10.0.0.0/16 (us-east-1)
│
├── Public Subnet 10.0.1.0/24 (us-east-1a)   ← has route to Internet Gateway
├── Public Subnet 10.0.2.0/24 (us-east-1b)
│
├── Private Subnet 10.0.10.0/24 (us-east-1a)  ← no direct internet
├── Private Subnet 10.0.11.0/24 (us-east-1b)  ← egress via NAT Gateway
│
└── Database Subnet 10.0.20.0/24 (us-east-1a) ← no internet at all
    Database Subnet 10.0.21.0/24 (us-east-1b)

Internet Gateway: allows public subnets to reach internet
NAT Gateway: allows private subnets to make outbound requests (not inbound)
```

### Security Groups vs NACLs

| | Security Group | NACL |
|---|---|---|
| Operates on | Instance (ENI) level | Subnet level |
| State | Stateful (return traffic auto-allowed) | Stateless (must allow both directions) |
| Rules | Allow only | Allow and Deny |
| Evaluation | All rules evaluated | Rules evaluated in number order, first match wins |
| Default | Deny all inbound, allow all outbound | Allow all |

```python
# Security group: only ALB SG can reach app SG on port 8080
# App SG:
#   Inbound: TCP 8080 from ALB SG (not from 0.0.0.0/0)
#   Outbound: all (to reach RDS, ElastiCache, etc.)

# RDS SG:
#   Inbound: TCP 5432 from App SG only
#   Outbound: none needed (stateful)
```

### VPC endpoints

Keep AWS service traffic inside the AWS network (no NAT Gateway, no internet):

```python
# Interface endpoint: S3, Secrets Manager, ECR, etc.
ec2.create_vpc_endpoint(
    VpcId='vpc-abc123',
    ServiceName='com.amazonaws.us-east-1.secretsmanager',
    VpcEndpointType='Interface',
    SubnetIds=['subnet-private-1a', 'subnet-private-1b'],
    SecurityGroupIds=['sg-vpc-endpoints'],
    PrivateDnsEnabled=True,  # resolve secretsmanager.us-east-1.amazonaws.com to private IP
)

# Gateway endpoint: S3 and DynamoDB (free)
ec2.create_vpc_endpoint(
    VpcId='vpc-abc123',
    ServiceName='com.amazonaws.us-east-1.s3',
    VpcEndpointType='Gateway',
    RouteTableIds=['rtb-private'],
)
```

## Load Balancers

### ALB (Application Load Balancer)

Layer 7 — routes HTTP/HTTPS by host, path, headers, query strings.

```python
elbv2 = boto3.client('elbv2')

# Create ALB
alb = elbv2.create_load_balancer(
    Name='order-service-alb',
    Subnets=['subnet-public-1a', 'subnet-public-1b'],
    SecurityGroups=['sg-alb'],
    Scheme='internet-facing',
    Type='application',
)

# Listener: HTTPS on 443
listener = elbv2.create_listener(
    LoadBalancerArn=alb['LoadBalancers'][0]['LoadBalancerArn'],
    Protocol='HTTPS',
    Port=443,
    Certificates=[{'CertificateArn': 'arn:aws:acm:...'}],
    DefaultActions=[{'Type': 'forward', 'TargetGroupArn': target_group_arn}],
)

# Rules: path-based routing
elbv2.create_rule(
    ListenerArn=listener['Listeners'][0]['ListenerArn'],
    Priority=10,
    Conditions=[{'Field': 'path-pattern', 'Values': ['/api/v2/*']}],
    Actions=[{'Type': 'forward', 'TargetGroupArn': v2_target_group_arn}],
)
```

**ALB features:**
- Path-based routing: `/orders` → order service, `/payments` → payment service
- Host-based routing: `api.example.com` vs `admin.example.com`
- Weighted target groups: canary deployments (90/10 split)
- gRPC support (unary only — for streaming, use NLB)
- WAF integration
- Cognito/OIDC authentication built-in

### NLB (Network Load Balancer)

Layer 4 — TCP/UDP. Ultra-low latency, preserves source IP.

```
Use NLB when:
  - gRPC with server/bidi streaming (ALB doesn't support HTTP trailers)
  - WebSocket at massive scale
  - Need static IP for whitelisting
  - UDP traffic (gaming, media)
  - Preserve client source IP
  - Extreme performance (millions of RPS, sub-1ms latency)
```

### Global Accelerator

Routes users to the nearest AWS edge, then uses AWS backbone (faster than internet):

```
User in Sydney → AWS PoP Sydney (anycast) → AWS backbone → us-east-1

vs. without GA:
User in Sydney → public internet → us-east-1 (slower, more hops)

Benefit: 10–60% latency improvement for global users
Use case: global APIs, gaming, real-time apps
Not for: static content (use CloudFront instead)
```

## CloudFront (CDN)

Caches content at 400+ edge locations worldwide.

```python
cloudfront = boto3.client('cloudfront')

# Distribution with S3 origin (static site / media)
cloudfront.create_distribution(
    DistributionConfig={
        'Origins': {
            'Items': [{
                'Id': 's3-origin',
                'DomainName': 'my-bucket.s3.amazonaws.com',
                'S3OriginConfig': {
                    'OriginAccessIdentity': ''  # use OAC instead
                },
            }]
        },
        'DefaultCacheBehavior': {
            'ViewerProtocolPolicy': 'redirect-to-https',
            'CachePolicyId': '...',  # managed cache policy
            'AllowedMethods': {'Items': ['GET', 'HEAD'], 'CachedMethods': {'Items': ['GET', 'HEAD']}},
        },
        'Enabled': True,
        'HttpVersion': 'http2and3',  # HTTP/3 (QUIC) enabled
        'PriceClass': 'PriceClass_100',  # US + Europe only (cheapest)
    }
)
```

### CloudFront cache behaviors

```
/api/*          → ALB origin, TTL=0 (no cache), forward all headers
/static/*       → S3 origin, TTL=31536000 (1 year), Cache-Control: immutable  
/*.html         → S3 origin, TTL=0 (revalidate, content changes)
/images/*       → S3 origin, TTL=86400 (1 day)
```

### Lambda@Edge vs CloudFront Functions

| | CloudFront Functions | Lambda@Edge |
|---|---|---|
| Runtime | JavaScript only | Node.js, Python |
| Max execution | 1ms | 5s (viewer), 30s (origin) |
| Memory | 2MB | 128MB – 10GB |
| Use case | Header manipulation, URL rewrites | Auth, A/B testing, complex logic |
| Cost | ~1/6 of Lambda@Edge | More expensive |

## Route 53

DNS service with health checks and routing policies.

```python
route53 = boto3.client('route53')

# Weighted routing: 90% stable, 10% canary
route53.change_resource_record_sets(
    HostedZoneId='Z123ABC',
    ChangeBatch={'Changes': [
        {
            'Action': 'UPSERT',
            'ResourceRecordSet': {
                'Name': 'api.example.com',
                'Type': 'A',
                'SetIdentifier': 'stable',
                'Weight': 90,
                'AliasTarget': {'HostedZoneId': '...', 'DNSName': stable_alb_dns, 'EvaluateTargetHealth': True},
            }
        },
        {
            'Action': 'UPSERT',
            'ResourceRecordSet': {
                'Name': 'api.example.com',
                'Type': 'A',
                'SetIdentifier': 'canary',
                'Weight': 10,
                'AliasTarget': {'HostedZoneId': '...', 'DNSName': canary_alb_dns, 'EvaluateTargetHealth': True},
            }
        }
    ]}
)
```

### Route 53 routing policies

| Policy | Use case |
|---|---|
| Simple | Single resource |
| Weighted | Canary / A/B split |
| Latency-based | Route to lowest-latency region |
| Geolocation | Route by user's country/continent |
| Geoproximity | Route by distance, with bias |
| Failover | Active-passive DR |
| Multi-value | Return up to 8 healthy records |

## API Gateway

Fully managed API front door.

| Type | Protocol | Use case |
|---|---|---|
| REST API | HTTP | Full features, caching, usage plans |
| HTTP API | HTTP | Lower cost, Lambda/HTTP proxy, OIDC JWT auth |
| WebSocket API | WebSocket | Real-time, connections tracked by Gateway |

```python
# HTTP API with Lambda integration (simplest)
apigw = boto3.client('apigatewayv2')

api = apigw.create_api(
    Name='order-api',
    ProtocolType='HTTP',
    CorsConfiguration={
        'AllowOrigins': ['https://app.example.com'],
        'AllowMethods': ['GET', 'POST', 'PUT', 'DELETE'],
        'AllowHeaders': ['Authorization', 'Content-Type'],
    }
)

# JWT authorizer (no Lambda needed for Cognito/Auth0)
authorizer = apigw.create_authorizer(
    ApiId=api['ApiId'],
    AuthorizerType='JWT',
    IdentitySource='$request.header.Authorization',
    JwtConfiguration={
        'Audience': ['order-service'],
        'Issuer': 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc123',
    }
)
```

## Networking interview patterns

```
"Design a highly available web API on AWS":
  Route 53 (latency routing) →
  CloudFront (cache + WAF) →
  ALB (across 3 AZs) →
  ECS Fargate (private subnets) →
  RDS Aurora Multi-AZ + Read Replicas

"Expose microservices without exposing each service":
  ALB path-based routing → different ECS services per path
  Or: API Gateway → Lambda/ECS per route

"Service-to-service communication":
  Private subnets + security groups (only source SG can reach destination SG)
  AWS PrivateLink / VPC endpoints for AWS services
  Service mesh (App Mesh / Istio) for fine-grained policies
```

## Related topics

- [DNS](../networking/dns.md)
- [CDN](../networking/cdn.md)
- [Load Balancing](../networking/load-balancing.md)
- [API Gateway](../networking/api-gateway.md)
