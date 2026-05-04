# Secrets Management

## What it is

Secrets management is the practice of storing, distributing, rotating, and auditing sensitive credentials — API keys, database passwords, TLS certificates, encryption keys — without exposing them in code, config files, or logs.

```
Bad secrets management (how breaches happen):
  Secrets in source code → committed to git → exposed in GitHub
  Secrets in .env files → included in Docker images → pushed to registry
  Secrets in environment variables → logged in crash dumps
  Shared passwords → no audit trail, hard to rotate
  Long-lived credentials → breach = unlimited access forever

Good secrets management:
  Secrets in a vault → encrypted at rest, access controlled
  Short-lived credentials → auto-rotated, breach window = minutes
  Audit log → who accessed what, when
  Least privilege → each service gets only its own secrets
```

## AWS Secrets Manager

The managed AWS solution for secrets management:

```python
import boto3
import json

secrets_client = boto3.client('secretsmanager', region_name='us-east-1')

# Store a secret
def create_secret(name: str, value: dict):
    secrets_client.create_secret(
        Name=name,
        SecretString=json.dumps(value),
        Description='Order service database credentials',
        KmsKeyId='arn:aws:kms:us-east-1:123:key/...',
        Tags=[{'Key': 'Environment', 'Value': 'production'}]
    )

# Retrieve a secret
def get_secret(secret_name: str) -> dict:
    response = secrets_client.get_secret_value(SecretId=secret_name)
    return json.loads(response['SecretString'])

# Usage — cache to avoid API calls on every request
import functools
import time

class SecretCache:
    def __init__(self, ttl_seconds: int = 300):
        self._cache = {}
        self._ttl = ttl_seconds
    
    def get(self, secret_name: str) -> dict:
        if secret_name in self._cache:
            value, expires_at = self._cache[secret_name]
            if time.time() < expires_at:
                return value
        
        value = get_secret(secret_name)
        self._cache[secret_name] = (value, time.time() + self._ttl)
        return value

secret_cache = SecretCache(ttl_seconds=300)

# Application startup
def get_db_config() -> dict:
    secret = secret_cache.get('production/order-service/db')
    return {
        'host': secret['host'],
        'port': secret['port'],
        'username': secret['username'],
        'password': secret['password'],
        'database': secret['database'],
    }
```

### Automatic rotation

```python
# Configure Secrets Manager to rotate every 30 days
secrets_client.rotate_secret(
    SecretId='production/order-service/db',
    RotationLambdaARN='arn:aws:lambda:us-east-1:123:function:rotate-db-password',
    RotationRules={
        'AutomaticallyAfterDays': 30
    }
)

# Rotation Lambda (AWS provides templates for RDS)
def lambda_handler(event, context):
    step = event['Step']  # createSecret, setSecret, testSecret, finishSecret
    secret_id = event['SecretId']
    token = event['ClientRequestToken']
    
    if step == 'createSecret':
        # Generate new password, store as AWSPENDING version
        new_password = generate_secure_password()
        secrets_client.put_secret_value(
            SecretId=secret_id,
            ClientRequestToken=token,
            SecretString=json.dumps({**current_secret, 'password': new_password}),
            VersionStages=['AWSPENDING']
        )
    
    elif step == 'setSecret':
        # Apply new password to the database
        pending = get_pending_secret(secret_id, token)
        db.change_password(pending['username'], pending['password'])
    
    elif step == 'testSecret':
        # Verify new credentials work
        pending = get_pending_secret(secret_id, token)
        test_db_connection(pending)
    
    elif step == 'finishSecret':
        # Promote AWSPENDING to AWSCURRENT
        secrets_client.update_secret_version_stage(
            SecretId=secret_id,
            VersionStage='AWSCURRENT',
            MoveToVersionId=token,
            RemoveFromVersionId=get_current_version_id(secret_id)
        )
```

## HashiCorp Vault

The open-source secrets management platform. More feature-rich than AWS Secrets Manager — often used in multi-cloud or on-premises:

```
Vault features:
  Dynamic secrets: generate DB credentials on demand (never stored)
  Leases: credentials auto-expire, no manual rotation
  Policies: fine-grained ACL per secret path
  Auth methods: AWS IAM, Kubernetes, AppRole, LDAP, GitHub
  Audit logs: every secret access logged to file/Cloudwatch
  Secret engines: database, PKI, AWS, GCP, SSH, KV
```

### Dynamic database credentials

```python
import hvac

vault_client = hvac.Client(url='https://vault.example.com')

# Authenticate using AWS IAM (for ECS/EC2)
vault_client.auth.aws.iam_login(
    role='order-service-role',
)

# Get dynamic database credentials (valid for 1 hour)
creds = vault_client.secrets.database.generate_credentials(
    name='order-service-db',  # Vault role for this service
)

# creds.data = {"username": "v-order-s-abc123", "password": "A1b2C3d4..."}
# → Vault creates a real DB user with a random password
# → Credentials auto-expire in 1 hour
# → On expiry, Vault revokes the DB user automatically
# → No permanent DB password exists anywhere!

db_config = {
    'host': 'orders-db.us-east-1.rds.amazonaws.com',
    'username': creds.data['username'],
    'password': creds.data['password'],
    'database': 'orders',
}
```

### Vault in Kubernetes (Agent Injector)

```yaml
# Kubernetes pod with Vault Agent sidecar
apiVersion: v1
kind: Pod
metadata:
  name: order-service
  annotations:
    vault.hashicorp.com/agent-inject: "true"
    vault.hashicorp.com/role: "order-service"
    
    # Inject DB credentials as a file
    vault.hashicorp.com/agent-inject-secret-db: "database/creds/order-service-db"
    vault.hashicorp.com/agent-inject-template-db: |
      {{- with secret "database/creds/order-service-db" -}}
      DB_USERNAME={{ .Data.data.username }}
      DB_PASSWORD={{ .Data.data.password }}
      {{- end }}
spec:
  serviceAccountName: order-service  # used for Vault auth
  containers:
    - name: order-service
      image: order-service:latest
      # Credentials available at /vault/secrets/db
      # Vault Agent auto-renews before expiry
```

## AWS Parameter Store

Lighter-weight alternative to Secrets Manager — for non-secret configuration plus secrets:

```python
ssm = boto3.client('ssm', region_name='us-east-1')

# Store (encrypted with KMS for secrets)
ssm.put_parameter(
    Name='/production/order-service/db-password',
    Value='super-secret-password',
    Type='SecureString',  # encrypted with KMS
    KeyId='alias/order-service-key',
    Overwrite=True,
)

# Store plain config (not encrypted)
ssm.put_parameter(
    Name='/production/order-service/max-connections',
    Value='100',
    Type='String',
    Overwrite=True,
)

# Retrieve
response = ssm.get_parameter(
    Name='/production/order-service/db-password',
    WithDecryption=True  # decrypt with KMS
)
password = response['Parameter']['Value']

# Retrieve multiple at once (batch, cheaper)
response = ssm.get_parameters_by_path(
    Path='/production/order-service/',
    WithDecryption=True,
    Recursive=False,
)
config = {p['Name'].split('/')[-1]: p['Value'] for p in response['Parameters']}
```

**Secrets Manager vs Parameter Store:**

| Feature | Secrets Manager | Parameter Store |
|---|---|---|
| Auto-rotation | Yes (native + Lambda) | No (manual) |
| Cross-account | Yes | Limited |
| Cost | $0.40/secret/month + API calls | Free (standard), $0.05/10k API calls (advanced) |
| Versioning | Yes | Yes |
| Best for | Credentials needing rotation | Config + secrets, cost-sensitive |

## Secret injection patterns

### Environment variables (acceptable for non-sensitive config)

```dockerfile
# BAD: bake secrets into image
FROM python:3.11
ENV DATABASE_PASSWORD=my-secret-password  # exposed in image layers!

# GOOD: inject at runtime
# Docker run:
docker run -e DATABASE_PASSWORD=$(aws secretsmanager get-secret-value ...) myapp

# ECS Task Definition:
# Secrets from Secrets Manager or Parameter Store
{
  "secrets": [
    {
      "name": "DATABASE_PASSWORD",
      "valueFrom": "arn:aws:secretsmanager:us-east-1:123:secret:prod/db-password"
    }
  ]
}
```

### Files in tmpfs (secrets never written to disk)

```yaml
# Kubernetes secret as volume (in-memory tmpfs)
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: app
      volumeMounts:
        - name: secrets
          mountPath: /run/secrets
          readOnly: true
  volumes:
    - name: secrets
      secret:
        secretName: order-service-secrets
        defaultMode: 0400  # read-only by owner
  # Kubernetes mounts secrets as tmpfs (RAM) — not written to disk
```

### SDK at runtime

```python
# Application retrieves secrets on startup, caches in memory
class AppConfig:
    _instance = None
    
    def __init__(self):
        self._db_config = None
        self._stripe_key = None
        self._refresh_at = 0
    
    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def _refresh_if_needed(self):
        if time.time() > self._refresh_at:
            self._load_secrets()
            self._refresh_at = time.time() + 240  # refresh every 4 min
    
    def _load_secrets(self):
        client = boto3.client('secretsmanager')
        
        db_secret = json.loads(client.get_secret_value(
            SecretId='production/order-service/db'
        )['SecretString'])
        self._db_config = db_secret
        
        stripe_secret = json.loads(client.get_secret_value(
            SecretId='production/order-service/stripe'
        )['SecretString'])
        self._stripe_key = stripe_secret['api_key']
    
    @property
    def db_password(self) -> str:
        self._refresh_if_needed()
        return self._db_config['password']
    
    @property
    def stripe_api_key(self) -> str:
        self._refresh_if_needed()
        return self._stripe_key
```

## What never to do

```
Never:
  ✗ Commit secrets to git (even temporarily — git history is permanent)
  ✗ Put secrets in Docker images
  ✗ Log secrets (watch for exception traces printing env vars)
  ✗ Pass secrets as command-line arguments (visible in ps output)
  ✗ Email or Slack secrets
  ✗ Use the same secret across environments (dev/staging/prod)
  ✗ Use non-expiring credentials

Git secrets scanner (prevent accidental commits):
  git-secrets, truffleHog, detect-secrets, GitHub secret scanning
```

```bash
# Install pre-commit hook to prevent committing secrets
pip install detect-secrets
detect-secrets scan > .secrets.baseline
cat > .pre-commit-config.yaml << EOF
repos:
  - repo: https://github.com/Yelp/detect-secrets
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
EOF
pre-commit install
```

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you understand that secrets are part of the architecture, not an afterthought.

**Strong answer pattern:**
1. Secrets in Secrets Manager/Vault — never in code, env files, or Docker images
2. Dynamic credentials — Vault generates DB passwords on demand, auto-expiring
3. Rotation — Secrets Manager rotates automatically (30-day schedule); app must tolerate rotation
4. Cache secrets in memory — don't call Secrets Manager on every request
5. Audit trail — every secret access logged (Secrets Manager auto-logs to CloudTrail)

## Related topics

- [Encryption](encryption.md) — KMS encrypts secrets at rest
- [Zero Trust](zero-trust.md) — dynamic credentials are the ZT approach
- [Authentication & Authorization](authn-authz.md) — credentials used for service auth
- [Infrastructure as Code](../infrastructure/iac.md) — never put secrets in Terraform/CDK
