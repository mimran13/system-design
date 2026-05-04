# DNS

## What it is

DNS (Domain Name System) is the internet's distributed phonebook — it translates human-readable domain names (`api.example.com`) into IP addresses (`52.84.1.1`). It's a hierarchical, distributed system designed for massive scale and eventual consistency.

## Resolution chain

```mermaid
sequenceDiagram
    participant Client
    participant Resolver["Recursive Resolver\n(ISP or 8.8.8.8)"]
    participant Root["Root Name Server\n(13 sets worldwide)"]
    participant TLD["TLD Name Server\n(.com, .org, .io)"]
    participant Auth["Authoritative Name Server\n(Route 53, Cloudflare)"]

    Client->>Resolver: What is api.example.com?
    Resolver->>Root: What is api.example.com?
    Root-->>Resolver: Ask .com TLD server
    Resolver->>TLD: What is api.example.com?
    TLD-->>Resolver: Ask example.com nameserver
    Resolver->>Auth: What is api.example.com?
    Auth-->>Resolver: 52.84.1.1 (TTL: 300)
    Resolver-->>Client: 52.84.1.1 (cached for 300s)
```

**TTL (Time-To-Live):** How long a resolver caches the answer. Low TTL = faster propagation of changes. High TTL = fewer DNS lookups, faster resolution.

## Record types

| Type | Purpose | Example |
|---|---|---|
| **A** | Domain → IPv4 address | `api.example.com → 52.84.1.1` |
| **AAAA** | Domain → IPv6 address | `api.example.com → 2001:db8::1` |
| **CNAME** | Alias (domain → domain) | `www.example.com → example.com` |
| **MX** | Mail exchange | `example.com → mail.example.com (priority 10)` |
| **TXT** | Text (SPF, DKIM, verification) | `v=spf1 include:amazonses.com ~all` |
| **NS** | Nameserver for zone | `example.com → ns1.awsdns.com` |
| **SRV** | Service location (protocol, port, host) | `_http._tcp.example.com → 0 5 443 api.example.com` |
| **PTR** | Reverse lookup (IP → domain) | `1.1.84.52.in-addr.arpa → api.example.com` |
| **SOA** | Zone authority (serial, refresh, retry) | Zone metadata |

**CNAME rules:**
- Cannot be used at zone apex (`example.com` itself) — use ALIAS or ANAME records instead
- Cannot be combined with other records at the same name
- AWS Route 53 supports ALIAS records that work like CNAME but at the apex

## DNS as a routing tool

DNS isn't just name resolution — it's a traffic routing mechanism.

### GeoDNS

Return different IPs based on client location:

```
User in US     → 52.84.1.1 (us-east-1 load balancer)
User in Europe → 35.180.0.1 (eu-west-1 load balancer)
User in Asia   → 13.54.0.1 (ap-southeast-1 load balancer)
```

Route 53 supports this via **Geolocation routing** and **Latency-based routing**.

### Weighted routing

Split traffic between multiple targets:

```
api.example.com:
  52.84.1.1  weight=90  (production)
  52.84.2.1  weight=10  (canary deployment)
```

Use for canary releases — gradually shift traffic.

### Failover routing

Primary/secondary with health checks:

```
api.example.com:
  Primary:  52.84.1.1 (health check: HTTPS /health)
  Secondary: 52.84.2.1 (only if primary fails)
```

Route 53 checks health every 30 seconds. Failover in ~1 minute (TTL + check interval).

### Round-robin DNS (simple load balancing)

Return multiple A records — clients use one round-robin:

```
api.example.com → 52.84.1.1, 52.84.1.2, 52.84.1.3
```

**Problems:** No health checking. Sticky clients. No load awareness. Don't use for real load balancing — use a proper load balancer.

## Route 53 routing policies

| Policy | Use case |
|---|---|
| Simple | Single record, no health checks |
| Weighted | A/B testing, canary, gradual migration |
| Latency | Route to lowest-latency region |
| Geolocation | Compliance (GDPR region), localization |
| Geoproximity | Route based on geographic distance + bias |
| Failover | Active/passive high availability |
| Multivalue Answer | Simple load balancing with health checks (max 8 records) |

## TTL strategy

| Scenario | Recommended TTL |
|---|---|
| Static content, rarely changes | 86400 (24 hours) |
| API endpoint, stable | 300 (5 minutes) |
| Pre-migration (about to change IPs) | 60 (1 minute) |
| Failover/DR setup | 60 (1 minute) |
| Internal service discovery | 0 or very low |

**Changing IPs:** Lower TTL 24-48 hours before the change. Wait for the old TTL to expire. Make the change. Raise TTL again after verifying.

## DNS caching layers

```
Browser cache (per-tab, OS-limited)
  → OS resolver cache (/etc/hosts, OS DNS cache)
    → ISP recursive resolver cache
      → Authoritative DNS (Route 53)
```

**Negative caching:** DNS caches `NXDOMAIN` (name not found) responses too. If you query a name that doesn't exist, the resolver caches "doesn't exist" for the TTL. Watch this when creating new records.

## DNS in microservices

Internal service-to-service communication uses private DNS (not public):

```
# Service A calls service B
http://user-service.production.svc.cluster.local:8080/api/users

# Kubernetes DNS resolves this:
user-service.production.svc.cluster.local → ClusterIP of user-service
```

AWS Route 53 Private Hosted Zones for VPC-internal DNS.

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you use DNS as a design tool — not just "it translates names to IPs."

**Strong answer pattern:**
1. Mention GeoDNS or latency routing for global systems
2. Use failover routing + health checks for DR
3. Explain TTL and why you'd lower it before a migration
4. For microservices: service discovery via internal DNS (Kubernetes CoreDNS, Route 53 Private Zones)

## Related topics

- [CDN](cdn.md) — DNS directs users to nearest edge node
- [Load Balancing](load-balancing.md) — DNS routes to the load balancer, not individual servers
- [AWS Networking](../aws/networking.md) — Route 53 in depth
