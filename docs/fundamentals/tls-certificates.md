# TLS and Certificates

TLS (Transport Layer Security, formerly SSL) is the encryption layer underneath HTTPS, gRPC, secure SMTP, and most "secure-by-default" protocols. It solves three problems at once: confidentiality, integrity, and authentication. The mechanics — handshakes, certificates, PKI — appear everywhere in modern systems.

---

## What TLS provides

| Property | Mechanism |
|---|---|
| **Confidentiality** | Symmetric encryption (AES-GCM, ChaCha20-Poly1305) of all data after handshake |
| **Integrity** | MAC / AEAD ensures bytes weren't tampered with |
| **Authentication** | Server (and optionally client) proves identity via certificate |
| **Forward secrecy** | Past sessions stay private even if long-term key leaks (via ephemeral key exchange) |

Without TLS, anyone on the network path can read or modify your traffic.

---

## The TLS 1.3 handshake (modern)

TLS 1.3 simplified everything. One round trip, fewer crypto choices, mandatory forward secrecy:

```
Client                                  Server
  │                                       │
  │ ───────► ClientHello                  │
  │          (supported ciphers,          │
  │           ephemeral pubkey,           │
  │           SNI=example.com)            │
  │                                       │
  │ ◄─────── ServerHello                  │
  │          (chosen cipher, ephemeral pubkey)
  │          {Certificate, signature, app data}
  │            ↑ encrypted from here on
  │                                       │
  │ ───────► {Finished, app data} ──────►│
  │                                       │
  │ ═══ encrypted bidirectional traffic ══│
```

**1 RTT** before app data flows (or 0 RTT on resumption — controversial because it allows replay attacks; usable for idempotent requests).

TLS 1.2 needed 2 RTTs. TLS 1.3 saves ~50-100 ms on first connection.

---

## The handshake in plain English

1. **Client says hello**: "I support these ciphers, here's a fresh public key for ephemeral key exchange, the server name I want is example.com (SNI)."

2. **Server responds**:
   - Picks a cipher
   - Sends its certificate (proof of identity)
   - Sends its ephemeral public key
   - Both sides now derive a shared secret using their ephemeral keys (Diffie-Hellman)
   - All subsequent server messages are encrypted with that shared secret

3. **Client verifies the certificate**:
   - Is it signed by a trusted CA?
   - Does the certificate's subject match `example.com`?
   - Is it within validity dates?
   - Is it not revoked?

4. **Client confirms** with `Finished` (a hash of the handshake messages, encrypted).

5. **Both sides** now have a shared symmetric key. All app data is encrypted with AES-GCM (or ChaCha20-Poly1305).

---

## Public key infrastructure (PKI)

Trust anchors:

```
Root CA (e.g., DigiCert, Let's Encrypt's ISRG Root)
  │
  ├── Intermediate CA (signs end-entity certs)
  │     │
  │     └── End-entity certificate (your example.com cert)
```

Your operating system / browser ships with ~150-200 root CA certificates. Anyone with a private key whose public counterpart is in that list can sign certificates that browsers will trust.

Hierarchy reasons:

- **Roots are kept offline** — compromise is catastrophic
- **Intermediates** sign end-entity certs; can be revoked without replacing the root
- **End-entity** certs are short-lived (days to ~1 year)

---

## What's in a certificate

X.509 v3 fields (the bytes of an actual cert):

```
Certificate:
  Version: v3
  Serial Number: 04:bf:bb:5d:3e:a7:...
  Signature Algorithm: ecdsa-with-SHA384
  Issuer: CN=DigiCert SHA2 Secure Server CA, O=DigiCert Inc
  Validity:
    Not Before: Jan 1 00:00:00 2026 UTC
    Not After:  Jan 1 23:59:59 2027 UTC
  Subject: CN=example.com, O=Example Inc, C=US
  Subject Public Key Info:
    Public Key Algorithm: id-ecPublicKey
    Public-Key: (256 bit)
    pub: 04:7c:9d:...
  X509v3 extensions:
    Subject Alternative Name (SAN):
      DNS:example.com
      DNS:www.example.com
      DNS:*.api.example.com
    Key Usage: Digital Signature, Key Agreement
    Extended Key Usage: TLS Web Server Authentication
    CRL Distribution Points: http://crl.digicert.com/...
    Authority Information Access:
      OCSP - URI:http://ocsp.digicert.com
      CA Issuers - URI:http://...
  Signature: 30:65:02:31:00:b5:...   (issuer signs everything above)
```

**SAN** (Subject Alternative Name) lists the domains the cert is valid for. Modern certs ignore the CN; SAN is what browsers check.

Inspect certs from the command line:

```bash
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \
  | openssl x509 -text -noout
```

---

## Certificate validation

A browser/client validates a cert by:

1. **Build a chain** from end-entity → intermediate(s) → root
2. Each cert's signature is verifiable by its issuer's public key
3. The chain ends at a cert in the trust store (root)
4. Each cert is within its `Not Before` / `Not After` dates
5. **Check revocation** (CRL or OCSP)
6. **SAN matches** the hostname being connected to
7. `Key Usage` permits TLS server auth

Any failure → connection rejected.

---

## Revocation: CRL and OCSP

### CRL (Certificate Revocation List)

CA publishes a list of revoked cert serial numbers. Clients download and check.

Problem: lists are large; checking is slow.

### OCSP (Online Certificate Status Protocol)

Client asks the CA: "Is this cert still valid?" CA responds yes/no.

Problem: privacy leak (CA sees who visits which site); slow.

### OCSP Stapling

Server fetches OCSP response from CA and **staples** it to its TLS handshake. Client doesn't need to query CA. Fast and private.

```nginx
# Nginx
ssl_stapling on;
ssl_stapling_verify on;
```

In practice: revocation is partially broken. Most browsers fall back to "soft fail" (accept cert if revocation check fails). Modern alternative: **short-lived certs** (Let's Encrypt's 90-day default; some go to 7 days) — limits damage of compromise.

---

## Mutual TLS (mTLS)

Both sides authenticate. The client presents a certificate too.

```
Client cert:  CN=service-a.production
Server cert:  CN=service-b.production

Server verifies: client's cert chain → trust store
Client verifies: server's cert chain → trust store

Both encrypt with derived shared key as before.
```

Use cases:

- **Service-to-service auth** in microservices (no need for app-level tokens)
- **Zero-trust networks** — every connection authenticated
- **API gateways** for B2B integrations
- **Service meshes** (Istio, Linkerd) — mTLS by default

In K8s + Istio, mTLS is automatic — sidecars handle cert issuance, rotation, and validation. App code is unaware.

See [Service Mesh](../infrastructure/service-mesh.md) and [Zero Trust](../security/zero-trust.md).

---

## Cipher suites

A "cipher suite" specifies the algorithms used: key exchange, authentication, encryption, MAC.

TLS 1.2 example: `ECDHE-RSA-AES256-GCM-SHA384`

- **ECDHE**: ephemeral elliptic-curve Diffie-Hellman (key exchange, forward secrecy)
- **RSA**: certificate authentication
- **AES-256-GCM**: symmetric encryption (with built-in MAC)
- **SHA-384**: hash for the handshake

TLS 1.3 simplified to just the AEAD:

- `TLS_AES_128_GCM_SHA256`
- `TLS_AES_256_GCM_SHA384`
- `TLS_CHACHA20_POLY1305_SHA256`

Five cipher choices in TLS 1.3 vs hundreds in TLS 1.2. Easier to configure correctly.

---

## SNI (Server Name Indication)

A single IP can host many TLS sites. Without SNI, the server doesn't know which cert to send.

```
ClientHello includes SNI: server_name = "api.example.com"
Server selects the matching cert from many on the same IP
```

Cleartext SNI is a privacy leak (network sees which site you visit). **ESNI / ECH** (Encrypted Client Hello) is the fix — encrypts SNI with a key advertised in DNS. Adoption growing.

---

## Forward secrecy

If a server's private key is compromised tomorrow, can past traffic be decrypted?

- **Without forward secrecy**: yes — if an attacker recorded ciphertext, they decrypt now
- **With forward secrecy** (ephemeral DH): no — past sessions used ephemeral keys discarded after the session

TLS 1.3 makes forward secrecy mandatory. TLS 1.2 supported but optional (and many configurations skipped it). Always require ephemeral key exchange.

---

## Performance

Once the handshake is done, TLS overhead is small:

```
Handshake CPU:    1-10 ms (RSA) or <1 ms (ECDSA)
Bulk encryption:  AES-NI hardware acceleration → near-line-speed
                  ChaCha20 on CPUs without AES-NI → still fast
```

Handshake CPU dominates on burst-of-connections workloads. Mitigations:

- **TLS session resumption** — abbreviated handshake on reconnect
- **Session tickets** (TLS 1.2/1.3) — server-issued resumption tokens
- **Connection reuse** — the obvious one
- **HTTP/2** — many requests over one TLS session
- **0-RTT (TLS 1.3)** — send data with the handshake (replay risk)

---

## Common pitfalls

| Pitfall | Mitigation |
|---|---|
| Disabling cert validation in clients | NEVER do this; pin certs if you need stricter trust |
| Long-lived certs | Use Let's Encrypt automation; rotate frequently |
| Weak cipher suites | Use Mozilla SSL Configurator; require TLS 1.2+ |
| Missing intermediates | Servers must send the full chain (cert + intermediates) |
| Cert mismatch (CN vs SAN) | Use SAN; modern browsers ignore CN |
| Self-signed certs in production | Only for internal mTLS where you control the trust store |

---

## Tools

```bash
# Inspect cert
openssl x509 -in cert.pem -text -noout

# Inspect remote
openssl s_client -connect example.com:443 -servername example.com

# Test cipher suites
nmap --script ssl-enum-ciphers -p 443 example.com

# Test TLS configuration online
curl https://www.ssllabs.com/ssltest/

# Generate self-signed for testing
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

---

## Let's Encrypt

The free, automated CA that fundamentally changed the TLS landscape. Issues 90-day certs via the **ACME** protocol.

```bash
certbot --nginx -d example.com -d www.example.com
```

Or via cert-manager in Kubernetes:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: example-tls
spec:
  secretName: example-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - example.com
    - www.example.com
```

cert-manager renews automatically before expiry. The 90-day expiry forces automation; long-lived certs are an anti-pattern in 2026.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you understand what TLS actually does, not just "we use HTTPS."

**Strong answer pattern:**
1. TLS provides confidentiality, integrity, authentication; layered over TCP (or QUIC)
2. Handshake: 1 RTT in TLS 1.3 (down from 2 in 1.2); session resumption / 0-RTT for repeat
3. PKI: roots → intermediates → end-entity; SAN matches hostname
4. Forward secrecy via ephemeral DH; mandatory in TLS 1.3
5. mTLS for service-to-service auth in zero-trust architectures
6. Let's Encrypt + automation has made cert management a solved problem

**Common follow-up:** *"Why is mTLS important in microservices?"*
> Service-to-service authentication without sharing tokens. Each service has a cert; the server checks the client's cert chain. Common in zero-trust networks where the network itself isn't trusted. Pairing with a service mesh (Istio, Linkerd) makes this transparent — sidecars handle cert issuance, rotation, and TLS handshakes; app code is unchanged.

---

## Related topics

- [TCP/UDP Deep Dive](tcp-udp-deep-dive.md) — TLS runs on TCP (and now QUIC)
- [Networking Basics](networking-basics.md) — what TLS protects
- [HTTP Versions](../networking/http-versions.md) — HTTPS in HTTP/2 and HTTP/3
- [Encryption](../security/encryption.md) — symmetric, asymmetric, KMS
- [Zero Trust](../security/zero-trust.md) — mTLS as a building block
- [Service Mesh](../infrastructure/service-mesh.md) — automatic mTLS
