# Encryption

## Encryption in transit vs at rest

```
In Transit:  data moving between systems (client ↔ server, service ↔ service)
  Protects: eavesdropping, man-in-the-middle attacks
  Mechanism: TLS 1.2+, mTLS

At Rest:    data stored on disk (databases, S3, backups)
  Protects: physical disk theft, unauthorized storage access
  Mechanism: AES-256, database-level encryption, field-level encryption
```

## TLS (Transport Layer Security)

The standard for encrypting data in transit. TLS 1.3 is current:

```
TLS Handshake (TLS 1.3):
1. Client → Server: ClientHello (supported cipher suites, key share)
2. Server → Client: ServerHello + Certificate + Finished
   Certificate: contains server's public key, signed by CA
3. Client verifies certificate against trusted CA list
4. Both derive session keys from key exchange
5. Encrypted application data flows

TLS 1.3 vs 1.2:
  1.2: 2-RTT handshake
  1.3: 1-RTT handshake (faster)
  1.3: 0-RTT resumption for returning connections
  1.3: Removed weak algorithms (RC4, DES, SHA1, RSA key exchange)
```

```nginx
# Nginx TLS configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305;
ssl_prefer_server_ciphers off;  # TLS 1.3 ignores this; needed for 1.2 compatibility

# Enable HSTS
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

# OCSP stapling: reduces client cert validation roundtrip
ssl_stapling on;
ssl_stapling_verify on;
```

## mTLS (Mutual TLS)

Both client and server authenticate with certificates — used for service-to-service communication:

```
Regular TLS:
  Client verifies server's certificate
  Server trusts any client (auth via token/API key)

Mutual TLS (mTLS):
  Client verifies server's certificate ✓
  Server verifies client's certificate ✓
  → Stronger than token-based auth for service mesh
```

```python
# Python service calling another service with mTLS
import ssl
import httpx

# Load client certificate and key
ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
ssl_context.load_cert_chain(
    certfile="/certs/client.crt",
    keyfile="/certs/client.key"
)
ssl_context.load_verify_locations("/certs/ca.crt")
ssl_context.verify_mode = ssl.CERT_REQUIRED

async with httpx.AsyncClient(verify=ssl_context) as client:
    response = await client.get("https://payment-service:8080/charge")
```

**Certificate rotation problem:**
- Certs expire → services must rotate without downtime
- Service mesh (Istio/Envoy) handles cert rotation automatically — services don't manage certs
- Certificate lifetime: typically 24-90 hours (short to limit exposure from compromise)

## Symmetric encryption (AES)

One key for both encryption and decryption:

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

def encrypt(plaintext: bytes, key: bytes) -> bytes:
    """Encrypt with AES-256-GCM (authenticated encryption)"""
    nonce = os.urandom(12)  # 96-bit nonce, unique per message
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return nonce + ciphertext  # prepend nonce for decryption

def decrypt(data: bytes, key: bytes) -> bytes:
    """Decrypt AES-256-GCM"""
    nonce = data[:12]
    ciphertext = data[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None)

# Key generation
key = AESGCM.generate_key(bit_length=256)  # 32 bytes

# Usage
plaintext = b"sensitive data"
encrypted = encrypt(plaintext, key)
decrypted = decrypt(encrypted, key)
```

**AES-GCM:**
- AES: block cipher (128-bit blocks)
- GCM: Galois/Counter Mode — turns AES into authenticated encryption
- Authenticated: provides both confidentiality AND integrity (detects tampering)
- 256-bit key = 2^256 possible keys (computationally unbreakable)

## Asymmetric encryption (RSA / ECC)

Public key encrypts, private key decrypts (or vice versa for signatures):

```python
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization

# Generate RSA key pair
private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=4096,  # 4096-bit for long-term security
)
public_key = private_key.public_key()

# Encrypt with public key (anyone can encrypt, only key holder can decrypt)
def rsa_encrypt(message: bytes, public_key) -> bytes:
    return public_key.encrypt(
        message,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )

# Decrypt with private key
def rsa_decrypt(ciphertext: bytes, private_key) -> bytes:
    return private_key.decrypt(
        ciphertext,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
```

**Limitation:** RSA is slow and limited to encrypting small data (< key size).  
**Common pattern:** Use RSA/ECC to encrypt an AES key, then AES to encrypt data (hybrid encryption). This is what TLS does.

## Field-level encryption

Encrypt specific sensitive fields before storing in the database:

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import base64

class EncryptedField:
    def __init__(self, key: bytes):
        self.cipher = AESGCM(key)
    
    def encrypt(self, value: str) -> str:
        nonce = os.urandom(12)
        encrypted = self.cipher.encrypt(nonce, value.encode(), None)
        return base64.urlsafe_b64encode(nonce + encrypted).decode()
    
    def decrypt(self, encrypted_value: str) -> str:
        data = base64.urlsafe_b64decode(encrypted_value)
        nonce, ciphertext = data[:12], data[12:]
        return self.cipher.decrypt(nonce, ciphertext, None).decode()

# Usage in ORM model
class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True)
    email = Column(String)  # plaintext (needed for lookup)
    
    # Encrypted fields
    _ssn_encrypted = Column("ssn_encrypted", String)
    _credit_card_encrypted = Column("credit_card_encrypted", String)
    
    @property
    def ssn(self) -> str:
        return field_cipher.decrypt(self._ssn_encrypted)
    
    @ssn.setter
    def ssn(self, value: str):
        self._ssn_encrypted = field_cipher.encrypt(value)
```

**Searchable fields:** Encryption makes searching difficult. Approaches:
- Hash the field for equality searches: `sha256(ssn) → stored alongside encrypted SSN`
- Use a searchable encryption scheme (complex)
- Use a data tokenization service (Vault, AWS Macie)
- Avoid making encrypted fields searchable (preferred)

## Database encryption

### Encryption at rest (RDS)

```python
# AWS: enable encryption at creation time (cannot be changed later)
rds = boto3.client('rds')
rds.create_db_instance(
    DBInstanceIdentifier='order-db',
    DBInstanceClass='db.t3.medium',
    Engine='postgres',
    StorageEncrypted=True,           # AES-256 for storage
    KmsKeyId='arn:aws:kms:us-east-1:123:key/...',  # use CMK (not default)
    MasterUsername='admin',
    MasterUserPassword='...',  # use Secrets Manager instead
)
```

### Transparent Data Encryption (TDE)

Database-level encryption — all data encrypted on disk, decrypted in memory:

```sql
-- PostgreSQL with pgcrypto for column-level encryption
SELECT pgp_sym_encrypt(
    'sensitive_value',
    current_setting('app.encryption_key')
) AS encrypted_data;

SELECT pgp_sym_decrypt(
    encrypted_data::bytea,
    current_setting('app.encryption_key')
) AS decrypted_data FROM users;
```

## Hashing

One-way transformation — used for passwords and integrity verification:

```python
import bcrypt
import hashlib
import hmac

# Passwords: use bcrypt (slow by design)
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12))
is_valid = bcrypt.checkpw(password.encode(), hashed)

# Data integrity: SHA-256 (fast)
digest = hashlib.sha256(data).hexdigest()

# HMAC: keyed hash (prevents length extension attacks)
mac = hmac.new(key, message, hashlib.sha256).hexdigest()
is_valid = hmac.compare_digest(mac, received_mac)  # constant-time comparison
```

| Algorithm | Use case | Speed | Notes |
|---|---|---|---|
| bcrypt | Passwords | Slow (intentional) | Adaptive cost factor |
| Argon2id | Passwords | Slow (intentional) | Current best practice |
| SHA-256 | Data integrity, fingerprints | Fast | Don't use for passwords |
| HMAC-SHA256 | Message authentication | Fast | Requires shared key |
| MD5 / SHA-1 | Legacy only | Fast | **Cryptographically broken** |

## Key management

The weakest link: where do you store encryption keys?

### Bad approaches

```python
# BAD: key in source code
ENCRYPTION_KEY = b"hardcoded_secret_key_here"

# BAD: key in environment variable (visible in logs, process listings)
ENCRYPTION_KEY = os.environ["ENCRYPTION_KEY"]  # better but still risky
```

### AWS KMS (Key Management Service)

```python
import boto3
import base64

kms = boto3.client('kms', region_name='us-east-1')
KEY_ID = 'arn:aws:kms:us-east-1:123456789:key/abc-123'

# Encrypt data key using KMS (envelope encryption)
def generate_data_key() -> tuple[bytes, bytes]:
    """Returns (plaintext_key, encrypted_key)"""
    response = kms.generate_data_key(
        KeyId=KEY_ID,
        KeySpec='AES_256'
    )
    return response['Plaintext'], response['CiphertextBlob']

# Encrypt workflow:
plaintext_key, encrypted_key = generate_data_key()
ciphertext = encrypt_with_aes(data, plaintext_key)
# Store: ciphertext + encrypted_key (not plaintext_key)
del plaintext_key  # clear from memory

# Decrypt workflow:
response = kms.decrypt(CiphertextBlob=encrypted_key)
plaintext_key = response['Plaintext']
data = decrypt_with_aes(ciphertext, plaintext_key)
del plaintext_key  # clear from memory
```

**Envelope encryption:**
```
CMK (Customer Master Key) in KMS — never leaves KMS
  ↓ generates
Data Key (unique per object) — used to encrypt actual data
  ↓ encrypts
Ciphertext + encrypted_data_key — stored in S3/DB

Decrypt: KMS decrypts data_key → use it to decrypt ciphertext
  → CMK never exposed; data key minimally exposed (in memory only)
```

## AWS encryption services summary

| Service | What it encrypts | Key management |
|---|---|---|
| **KMS** | Keys (CMKs), data via API | AWS managed or customer managed |
| **S3** SSE-S3 | S3 objects | AWS managed (free) |
| **S3** SSE-KMS | S3 objects | KMS CMK (audited, per-call cost) |
| **RDS** at-rest | Database storage | KMS CMK |
| **Secrets Manager** | Secrets/credentials | KMS CMK |
| **ACM** | TLS certificates | Managed, auto-renewed |
| **CloudHSM** | Keys in hardware | Customer managed (FIPS 140-2 Level 3) |

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you think about where data is sensitive and how to protect it.

**Strong answer pattern:**
1. In transit: TLS everywhere, mTLS for service-to-service
2. At rest: AES-256, enable RDS/S3 encryption — it's just a checkbox on AWS
3. Passwords: bcrypt/Argon2 — never SHA256, never MD5
4. Keys: AWS KMS with envelope encryption — never hardcode, never in env vars
5. Field-level: encrypt only the sensitive fields (SSN, card numbers, PII)

## Related topics

- [Secrets Management](secrets-management.md) — storing and rotating keys safely
- [Authentication & Authorization](authn-authz.md) — TLS for auth channel
- [Zero Trust](zero-trust.md) — mTLS as the zero trust mechanism
- [API Security](api-security.md) — HTTPS requirement
- [Blob Storage](../storage/blob-storage.md) — S3 encryption options
