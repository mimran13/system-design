# AWS Security

## IAM (Identity and Access Management)

The foundation of AWS security. Controls who can do what to which resources.

### Principals, policies, permissions

```
Principal (who): IAM user, IAM role, AWS service, federated identity
Action (what):   s3:GetObject, ec2:DescribeInstances, dynamodb:PutItem
Resource (which): arn:aws:s3:::my-bucket/*, arn:aws:dynamodb:*:*:table/orders
```

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOrderTableAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:123456789:table/orders",
        "arn:aws:dynamodb:us-east-1:123456789:table/orders/index/*"
      ],
      "Condition": {
        "StringEquals": {
          "dynamodb:LeadingKeys": "${aws:PrincipalTag/user_id}"
        }
      }
    },
    {
      "Effect": "Deny",
      "Action": "dynamodb:DeleteItem",
      "Resource": "*"
    }
  ]
}
```

### IAM roles for services (IRSA, ECS task roles)

```python
# ECS task role: ECS tasks get IAM permissions without access keys
# In task definition:
{
    "taskRoleArn": "arn:aws:iam::123:role/order-service-task-role"
}

# EKS: IRSA (IAM Roles for Service Accounts)
# Trust policy on role:
{
    "Principal": {
        "Federated": "arn:aws:iam::123:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/ABC123"
    },
    "Condition": {
        "StringEquals": {
            "oidc.eks.us-east-1.amazonaws.com/id/ABC123:sub": 
                "system:serviceaccount:production:order-service"
        }
    }
}

# Annotation on K8s ServiceAccount:
# eks.amazonaws.com/role-arn: arn:aws:iam::123:role/order-service-role
```

### IAM best practices

```
✓ Least privilege: grant minimum permissions needed
✓ Use roles, not users, for services
✓ Enable MFA for all human IAM users
✓ Rotate access keys regularly (or eliminate them with roles)
✓ Use permission boundaries to cap max permissions
✓ Enable CloudTrail to audit all IAM activity
✓ Use Organizations SCPs to enforce guardrails across accounts

✗ Never use root account for day-to-day operations
✗ Never embed access keys in code or containers
✗ Never use wildcard (*) actions on sensitive resources
✗ Never create IAM users for services (use roles)
```

## AWS Secrets Manager

Store, rotate, and audit secrets:

```python
import boto3
import json

def get_secret(secret_name: str) -> dict:
    client = boto3.client('secretsmanager', region_name='us-east-1')
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response['SecretString'])

# Enable automatic rotation (Lambda-based)
client.rotate_secret(
    SecretId='production/order-service/db',
    RotationLambdaARN='arn:aws:lambda:...:function:rotate-db-creds',
    RotationRules={'AutomaticallyAfterDays': 30}
)

# All secret access logged to CloudTrail
```

## KMS (Key Management Service)

Managed encryption key service:

```python
kms = boto3.client('kms')

# Create customer managed key (CMK)
key = kms.create_key(
    Description='Order service data encryption key',
    KeyPolicy=json.dumps({
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"AWS": "arn:aws:iam::123:role/order-service-task-role"},
            "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
            "Resource": "*"
        }]
    })
)

# Envelope encryption for S3
# S3 server-side encryption with KMS CMK:
s3.put_object(
    Bucket='order-attachments',
    Key='receipts/ord_123.pdf',
    Body=pdf_bytes,
    ServerSideEncryption='aws:kms',
    SSEKMSKeyId='arn:aws:kms:us-east-1:123:key/abc-123',
)

# RDS: enable encryption at creation (KMS)
# DynamoDB: encrypted by default (can specify CMK)
# EBS: encrypt volumes with CMK
```

### KMS key types

| Key type | Managed by | Use case |
|---|---|---|
| AWS managed key | AWS | Default, free, per-service keys |
| Customer managed key (CMK) | You | Custom policies, cross-account, audit |
| CloudHSM | You (hardware) | FIPS 140-2 Level 3 compliance |

## AWS WAF (Web Application Firewall)

Filter malicious traffic before it reaches your application:

```python
wafv2 = boto3.client('wafv2', region_name='us-east-1')

# Create WebACL
wafv2.create_web_acl(
    Name='order-service-waf',
    Scope='REGIONAL',
    DefaultAction={'Allow': {}},
    Rules=[
        # AWS managed rules (SQLi, XSS, known bad IPs)
        {
            'Name': 'AWSManagedRulesCommonRuleSet',
            'Priority': 1,
            'OverrideAction': {'None': {}},
            'Statement': {
                'ManagedRuleGroupStatement': {
                    'VendorName': 'AWS',
                    'Name': 'AWSManagedRulesCommonRuleSet',
                }
            },
            'VisibilityConfig': {
                'SampledRequestsEnabled': True,
                'CloudWatchMetricsEnabled': True,
                'MetricName': 'CommonRuleSetMetric',
            }
        },
        # Rate limiting
        {
            'Name': 'RateLimitPerIP',
            'Priority': 2,
            'Action': {'Block': {}},
            'Statement': {
                'RateBasedStatement': {
                    'Limit': 2000,  # requests per 5 minutes
                    'AggregateKeyType': 'IP',
                }
            },
            'VisibilityConfig': {
                'SampledRequestsEnabled': True,
                'CloudWatchMetricsEnabled': True,
                'MetricName': 'RateLimitMetric',
            }
        },
    ],
    VisibilityConfig={
        'SampledRequestsEnabled': True,
        'CloudWatchMetricsEnabled': True,
        'MetricName': 'OrderServiceWAF',
    }
)

# Attach to ALB
wafv2.associate_web_acl(
    WebACLArn=web_acl_arn,
    ResourceArn=alb_arn,
)
```

## AWS Cognito

Managed user authentication:

```python
cognito = boto3.client('cognito-idp')

USER_POOL_ID = 'us-east-1_abc123'
CLIENT_ID = 'abc123def456'

# Sign up
cognito.sign_up(
    ClientId=CLIENT_ID,
    Username='alice@example.com',
    Password='SecurePass123!',
    UserAttributes=[
        {'Name': 'email', 'Value': 'alice@example.com'},
        {'Name': 'name', 'Value': 'Alice'},
    ]
)

# Confirm email
cognito.confirm_sign_up(
    ClientId=CLIENT_ID,
    Username='alice@example.com',
    ConfirmationCode='123456',
)

# Sign in → get tokens
response = cognito.initiate_auth(
    AuthFlow='USER_PASSWORD_AUTH',
    AuthParameters={'USERNAME': 'alice@example.com', 'PASSWORD': 'SecurePass123!'},
    ClientId=CLIENT_ID,
)
access_token = response['AuthenticationResult']['AccessToken']
id_token = response['AuthenticationResult']['IdToken']       # JWT with user claims
refresh_token = response['AuthenticationResult']['RefreshToken']

# Verify JWT (use JWKS from Cognito's public endpoint)
# https://cognito-idp.us-east-1.amazonaws.com/{pool_id}/.well-known/jwks.json
```

**Cognito features:**
- User pools: user directory with sign-up/sign-in
- Identity pools: federated identities (assume IAM roles for AWS access)
- Social login: Google, Facebook, Apple, SAML
- MFA: TOTP, SMS
- Advanced security: adaptive authentication, compromised credential detection
- Lambda triggers: pre-authentication, post-confirmation, custom claims

## AWS Shield

DDoS protection:

| Tier | Coverage | Cost |
|---|---|---|
| Shield Standard | L3/L4 DDoS (SYN floods, UDP reflection) | Free |
| Shield Advanced | L7 DDoS, WAF included, DDoS response team, cost protection | $3,000/month |

## VPC Security

```
Defense in depth:
  Internet → WAF/Shield → CloudFront → ALB (public subnet)
                                          ↓
                                    Security Groups
                                          ↓
                                ECS/EC2 (private subnet)
                                          ↓
                                    Security Groups
                                          ↓
                                  RDS (database subnet)
                                          ↓
                                    NACLs (subnet-level)

Each layer only trusts the layer above it:
  RDS SG: only accepts connections from ECS SG
  ECS SG: only accepts connections from ALB SG
  ALB SG: only accepts 443 from 0.0.0.0/0
```

## CloudTrail

Audit log for all AWS API calls:

```python
# CloudTrail is always on (management events) for your account
# Enable data events for S3 and DynamoDB:
cloudtrail.put_event_selectors(
    TrailName='production-trail',
    EventSelectors=[{
        'ReadWriteType': 'All',
        'IncludeManagementEvents': True,
        'DataResources': [
            {'Type': 'AWS::S3::Object', 'Values': ['arn:aws:s3:::order-attachments/']},
            {'Type': 'AWS::DynamoDB::Table', 'Values': ['arn:aws:dynamodb:*:*:table/orders']},
        ]
    }]
)

# Query with Athena: who deleted this S3 object?
# SELECT * FROM cloudtrail_logs
# WHERE eventname = 'DeleteObject'
#   AND requestparameters LIKE '%receipts/ord_123.pdf%'
# ORDER BY eventtime DESC
```

## AWS Config

Tracks configuration changes and evaluates compliance rules:

```python
# Detect unencrypted S3 buckets
config.put_config_rule(
    ConfigRule={
        'ConfigRuleName': 's3-bucket-server-side-encryption-enabled',
        'Source': {
            'Owner': 'AWS',
            'SourceIdentifier': 'S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED',
        }
    }
)

# Detect security groups open to 0.0.0.0/0 on port 22
config.put_config_rule(
    ConfigRule={
        'ConfigRuleName': 'restricted-ssh',
        'Source': {
            'Owner': 'AWS',
            'SourceIdentifier': 'INCOMING_SSH_DISABLED',
        }
    }
)
```

## Security interview patterns

```
"How do you secure microservices on AWS?":
  1. Each service gets an IAM role (task role for ECS, IRSA for EKS)
  2. Least privilege: each role only accesses its own resources
  3. Security groups: only inter-service traffic allowed, no direct internet
  4. Secrets Manager for credentials, never hardcoded
  5. VPC endpoints for AWS services (no NAT needed for DynamoDB, S3)
  6. WAF on ALB for external-facing services
  7. CloudTrail + CloudWatch for audit/detection

"How do you encrypt customer data?":
  1. RDS + DynamoDB: encrypted at rest with KMS CMK (checkbox)
  2. S3: SSE-KMS on all buckets
  3. TLS everywhere in transit (ACM managed certs)
  4. Application-level: field-level encryption for PII (SSN, card numbers)
  5. KMS envelope encryption: CMK never leaves KMS, only data keys exposed briefly
```

## Related topics

- [Authentication & Authorization](../security/authn-authz.md)
- [OAuth & JWT](../security/oauth-jwt.md)
- [Encryption](../security/encryption.md)
- [Zero Trust](../security/zero-trust.md)
- [Secrets Management](../security/secrets-management.md)
