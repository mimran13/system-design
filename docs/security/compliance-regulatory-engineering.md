---
tags:
  - applied
---

# Compliance & Regulatory Engineering

What an engineer needs to know about SOC 2, GDPR, PCI-DSS, HIPAA — from the architect's perspective. Not lawyer-level depth; **engineer-level enough to design systems that don't fail audits or trigger fines.**

---

## Why this matters at staff level

Compliance isn't "the legal team's problem." It's an architectural constraint that shapes:

```
- Data flow design (where data can go)
- Access patterns (who can see what)
- Storage decisions (encryption, retention, residency)
- Logging (audit trails)
- Backups (encryption, retention, deletion)
- Incident response (notification timing)
- Vendor selection (BAAs, DPAs)
- Multi-region architecture
```

At staff level, you design systems that handle compliance by default. Junior engineers retrofit it under audit pressure (expensive, painful).

---

## SOC 2 — the table stakes for B2B SaaS

Service Organization Control 2. American auditing standard for service organisations. Increasingly required by enterprise buyers.

### What SOC 2 actually wants

Five Trust Service Categories (you usually focus on 1-3):

```
Security:                table-stakes; everyone does this one
Availability:            uptime / DR; common
Confidentiality:         data classification, access; sometimes
Processing Integrity:    correct processing; rarer
Privacy:                 PII handling; less common (GDPR covers more)
```

Most companies start with **Security + Availability**.

### Two types of report

```
SOC 2 Type I:   "you have controls" (point-in-time snapshot)
SOC 2 Type II:  "controls operated effectively over N months" (typically 6-12 months)
```

Enterprise customers want Type II. Type I is acceptable for newer companies; expectation is "Type II coming."

### What auditors look for — engineering perspective

```
Access controls:
  ✓ MFA on production access
  ✓ Just-in-time access (no permanent prod credentials)
  ✓ Access logs reviewed periodically
  ✓ Offboarding revokes access promptly

Change management:
  ✓ Code reviewed before deploy
  ✓ Deploys to production tracked
  ✓ Rollback procedure documented

Monitoring:
  ✓ Production systems monitored
  ✓ Alerts on suspicious activity
  ✓ Logs retained per policy

Backups:
  ✓ Backups taken regularly
  ✓ Backups tested (restored periodically)
  ✓ Backups encrypted

Incident response:
  ✓ IR plan documented
  ✓ Postmortems for security incidents
  ✓ Affected customers notified within SLA

Vendor management:
  ✓ Sub-processors tracked
  ✓ Risk assessments for vendors
```

### What auditors don't actually check

A common misconception: SOC 2 auditors deeply inspect your code. They don't.

```
They check:
  - Do you have policies?
  - Do the policies match what you do?
  - Can you show evidence?
  - Are controls operating consistently?

They don't check:
  - Whether your code is well-written
  - Whether your architecture is optimal
  - Whether your security is actually strong
```

This is a key distinction. SOC 2 is **assurance about processes**, not about security itself. Companies can be SOC 2 compliant and still have bad security.

### Engineering preparation

```
1. Single sign-on (Okta, Auth0) for everything → makes access reviews tractable
2. Just-in-time production access (no standing prod ssh) → IAM-controlled
3. CI/CD with mandatory PR review → change management
4. Centralised logging (CloudTrail, Datadog Audit Logs) → audit trails
5. Documented runbooks → operational readiness  
6. Automated backup tests → restore drills
7. Vulnerability scanning in CI (Trivy, Snyk) → patches
8. Vendor inventory + risk levels → sub-processor management
```

Tools that automate SOC 2 readiness: Vanta, Drata, Secureframe. They monitor controls continuously.

---

## GDPR — privacy for EU users

General Data Protection Regulation. EU law. Applies to anyone handling EU personal data, regardless of where the company is.

### Core principles (engineering view)

```
Lawful basis:        you can only process PII with a valid legal basis
Purpose limitation:  data collected for one purpose can't be used for another
Data minimisation:   collect only what you need
Accuracy:            data must be accurate; correctable
Storage limitation:  delete when no longer needed
Integrity:           secured against unauthorised access
Accountability:      you can prove you comply
```

### Engineering implications

**Right to access (Article 15)**: user requests a copy of all their data.

```
Implementation:
  - User-data export endpoint per user_id
  - Must include all PII across all stores
  - Includes derived data (analytics, ML inferences about the user)
  - 30-day response time

Engineering challenge:
  - PII is scattered across services
  - Need a registry of "where is X user's data?"
  - Often: build a "data inventory" → maintain as new services are added
```

**Right to erasure / "right to be forgotten" (Article 17)**:

```
User says: "delete my data"

Easy: hard-delete user record + cascade
Hard:  
  - Event logs (events are immutable; you can't easily delete)
  - Backups (still have user data even after live deletion)
  - Analytics aggregates (user data already mixed in)
  - Audit logs (you legally MUST keep some)
  - Third-party vendors (CRM, email, support) — propagate deletion to all

Pragmatic approach:
  1. Hard-delete from live OLTP databases
  2. Anonymise / pseudonymise in event logs (replace user_id with random ID; keep events for analytics)
  3. Crypto-shred: encrypt PII with per-user keys; delete keys on deletion request
  4. Document retention policy for backups (auto-expire after N days)
  5. Propagate deletion via API to all sub-processors with PII
```

**Crypto-shredding**:

```
For data you can't easily delete (events, archives):
  Store PII fields encrypted with per-user key
  When user requests deletion: delete the key
  Data exists but is unrecoverable

Practical: keys in KMS; per-user CMK or key per user
```

**Data residency**:

```
"EU personal data must stay in EU" is overstated; allowable under SCCs.
But many enterprise customers want it anyway.

Implementation:
  - Per-tenant region: EU customers' data lives in EU region
  - Cross-region replication: data residency requirements may forbid
  - Backups: also subject to residency
  - Logs: even logs of EU user activity must stay in EU
  - Customer support tooling: same
```

See [Multi-Region Architecture](../architecture/multi-region.md).

**Data Processing Agreements (DPAs)**:

```
You need DPAs with all sub-processors (vendors) handling EU data.
Most cloud vendors have standard DPAs.
Tracking sub-processors: who has access to EU data?
```

**Breach notification (Article 33)**:

```
Personal data breach: notify supervisory authority within 72 hours.
If high risk to individuals: notify them too.

Engineering implications:
  - Detect breaches (security monitoring)
  - Determine scope (which records affected?)
  - Communication: prepared templates; legal review
```

### GDPR fines

Up to €20M or 4% of global annual turnover (whichever higher). Companies have been fined €100M+ for major breaches.

This isn't theoretical risk. It shapes board-level conversations.

---

## CCPA / CPRA — California's GDPR-lite

Similar shape to GDPR; weaker. Applies to California residents.

```
Differences from GDPR:
  - Lower bar (apply to fewer companies)
  - Less restrictive on consent
  - "Do Not Sell" right (specific to data sales)
  - Lower fines

Engineering: very similar to GDPR.
If you're GDPR-compliant, CCPA is mostly free.
```

Other US state laws (Virginia, Colorado, Connecticut, Utah, etc.) are similar to CCPA. Federal law expected eventually.

---

## PCI-DSS — handling credit cards

Payment Card Industry Data Security Standard. Required if you handle credit card data.

### Cardholder Data Environment (CDE)

```
PCI scope = systems that store, process, or transmit cardholder data.
Smaller scope = easier compliance.
```

### Levels

```
Level 1: >6M transactions/year → external audit; the most onerous
Level 2: 1-6M transactions/year
Level 3: 20K-1M e-commerce transactions
Level 4: <20K e-commerce transactions → self-assessment

Most companies start at Level 4 (self-assessment via SAQ).
```

### How to minimise scope (the staff-level move)

```
Best practice: NEVER store cardholder data.

How: tokenisation via Stripe, Braintree, etc.

Customer enters card on Stripe-hosted page (or Stripe.js loaded in your page).
Stripe returns a token.
You store the token.
Charges go through Stripe API with the token.

Now your servers never see card data.
PCI scope: minimal (only your code that handles tokens).
```

This is the architectural pattern for 99% of B2C / B2B SaaS. Outsource card handling to PCI-certified vendors.

### When you can't avoid scope

If you do handle card data:

```
Required:
  ✓ Network segmentation (CDE separate from rest of infrastructure)
  ✓ Encryption in transit (TLS 1.2+) and at rest
  ✓ Access controls (MFA, role-based)
  ✓ Logging of all access to CDE
  ✓ Quarterly vulnerability scans (ASV)
  ✓ Annual penetration testing
  ✓ File integrity monitoring
  ✓ Anti-malware on systems handling card data

This is a lot of work. Avoid scope.
```

### Common PCI mistakes

```
✗ Logging card numbers in application logs
✗ Card data in test environments (treat as production scope)
✗ Card data in customer support tickets / CRM
✗ "Just temporarily" storing card data in a database column
```

Even ephemeral storage triggers PCI scope. The card number must touch only PCI-certified systems.

---

## HIPAA — healthcare

Health Insurance Portability and Accountability Act. US law for healthcare data.

### Who it applies to

```
Covered Entities:    healthcare providers, insurers, clearinghouses
Business Associates: third-parties handling Protected Health Information (PHI) on their behalf

If you build SaaS for healthcare, you're typically a Business Associate.
Requires Business Associate Agreement (BAA) with the Covered Entity.
```

### What's protected (PHI)

```
Health information that identifies (or could identify) an individual.
Includes:
  - Diagnoses, treatments
  - Demographics linked to health data
  - Insurance information
  - Even IP addresses + medical context can be PHI
```

### Engineering implications

```
✓ Encryption at rest and in transit (TLS, AES-256)
✓ Access controls (RBAC; minimum necessary)
✓ Audit logs of PHI access (who, when, what record)
✓ Backups encrypted
✓ Workforce training
✓ Breach notification (60 days)
✓ Sub-BAAs with all sub-processors (cloud vendor, email, etc.)

Cloud vendor BAAs:
  - AWS: BAA available; specific HIPAA-eligible services
  - GCP: BAA available
  - Azure: BAA available
  - Stripe, Twilio, etc.: case-by-case
```

### Practical patterns

```
HIPAA-eligible services on AWS:
  EC2, ECS, EKS, RDS, S3, DynamoDB, Lambda (most)
  CloudWatch, CloudTrail (audit logs)
  
NOT HIPAA-eligible (or care needed):
  Some newer services lag; check current list
  Many AI/ML services have specific terms

Architectural pattern:
  PHI lives only in HIPAA-eligible services
  Logs scrubbed of PHI before going to non-HIPAA services
  Strict network segmentation
```

### Penalties

```
Per violation:  $100 - $50,000
Per year:       $25,000 - $1,500,000
Plus criminal liability for "knowing" violations.

In practice: large breaches cost millions in fines + settlement + reputational damage.
```

---

## Data residency by country

Beyond GDPR, individual countries have data residency requirements:

```
Russia:        Russian personal data must be stored in Russia (Law 242-FZ)
China:         strict; personal info, "important data" → must stay in China
India:         certain financial data must be in India
Germany:       additional protections on top of GDPR
South Korea:   K-PIPA: similar to GDPR
Brazil:        LGPD: similar to GDPR
California:    CCPA + Sectoral laws

Each requires specific architectural patterns.
```

For multi-national SaaS: per-tenant region with strict data containment.

---

## Audit logging at the application level

Compliance frameworks all want audit logs.

### What to log

```
For every privileged action:
  - Who (user, service account, system)
  - What (action, entity affected)
  - When (timestamp with timezone)
  - Where (IP, source service)
  - Result (success / failure)

Examples of audit-worthy events:
  - User login / logout / failed login
  - Permission changes
  - Data export
  - Configuration changes
  - PII access (read of sensitive data)
  - Admin actions
  - API key creation / use
```

### What NOT to log

```
✗ Passwords (even hashed; just don't)
✗ Full credit card numbers (always)
✗ Full SSN / national ID
✗ API keys / secrets / tokens
✗ Free-form text that might contain PII
```

### Properties needed for compliance

```
✓ Tamper-evident or immutable (append-only)
✓ Encrypted at rest
✓ Access-restricted (separate from app data)
✓ Retention per policy (often 7 years for financial)
✓ Searchable for incident investigation
```

### Implementation

```
Option A: dedicated audit service
  Apps emit audit events to a queue
  Consumer writes to immutable store (S3 with Object Lock)
  Search via Athena / OpenSearch

Option B: tamper-evident log
  Write to append-only log (Kafka with infinite retention)
  Hash-chain entries
  Hash root anchored externally

Option C: managed service
  AWS CloudTrail (for AWS API calls)
  Datadog Audit Logs / Splunk
  Drata / Vanta integrate with these
```

For SOC 2 + GDPR: managed service is usually sufficient. For high-stakes (financial, healthcare): tamper-evident log.

---

## Data classification

Different data types need different protection.

```
Public:        marketing pages, public APIs → no special handling
Internal:      employee docs, internal metrics → company-only access
Confidential:  customer data, financial records → encrypted, access-logged
Restricted:    PII, credit cards, health records → encrypted, audited, minimised
```

### Engineering implications

```
Tag data at the database / column / field level
Different stores for different classifications (sometimes)
Different access patterns (MFA for restricted)
Different audit requirements
Different retention policies
Different backup encryption
```

Tools: column-level encryption (AWS RDS, Postgres pgcrypto), field-level encryption in app code, data classification tags in catalogues.

---

## Vendor management / sub-processors

Compliance flows through vendors.

```
You use Stripe for payments.
Stripe is a sub-processor of your customer data.
You need to:
  - Have a DPA with Stripe (GDPR)
  - Disclose Stripe as sub-processor (GDPR transparency)
  - Verify Stripe's compliance (SOC 2, PCI)
  - Reassess periodically
```

### Sub-processor registry

```
Maintain a list of all vendors handling customer data:
  - Vendor name
  - Data shared
  - Purpose
  - DPA / BAA status
  - Compliance certifications
  - Renewal date

Publish (at least summary) on your website for GDPR transparency.
Notify customers when you add sub-processors.
```

Tools: Vanta, Drata, Secureframe automate this tracking.

---

## Right to Be Forgotten — engineering deep dive

The hardest GDPR requirement to implement.

### The hierarchy

```
Live database:        easy to delete (DELETE FROM users WHERE id = X)
Live caches:          easy to invalidate
Search indices:       removable but takes time to propagate
Event streams:        immutable; can't easily delete
Analytics aggregates: data is mixed; hard
Backups:              still have user data; either restore-then-delete (impractical) or wait for expiry
Audit logs:           legally required to keep
Logs / metrics:       depends; some are PHI/PII
Sub-processors:       must propagate via API
Cold storage / archives: same as backups
```

### Practical approaches

**Pseudonymisation**:

```python
# Replace user_id with stable hash; original mapping deleted
user_pseudonym = hash(user_id + salt)

# Events keep the pseudonym
events.publish({"event": "page_view", "user_pseudonym": user_pseudonym})

# On deletion request: delete the mapping table entry
# Original user_id can no longer be derived
# Events remain for analytics (no longer PII)
```

**Crypto-shredding**:

```python
# Encrypt PII fields with per-user key
encrypted_email = encrypt(email, user_key)
encrypted_phone = encrypt(phone, user_key)

# Store in events / archives
events.publish({"user_id": user_id, "email_enc": encrypted_email})

# On deletion: delete user_key
# Existing data is now undecryptable
# Effectively unrecoverable PII
```

**Retention-based**:

```
Don't keep data longer than needed.
Backups: 30-day rolling (not 7 years).
Logs: 30-90 days standard.
Audit logs: per policy (often 7 years for financial).

Anything beyond retention is automatic deletion.
Deletion request just accelerates this for the user's records.
```

### What to communicate to users

```
"We have deleted your account data from our active systems within 30 days.
Backups containing your data will expire within 30 days of our next 
backup rotation. Audit logs retained for compliance for 7 years contain
metadata about your account but no personal information. All sub-processors
have been notified."
```

Transparency builds trust. Vague promises ("we deleted everything") backfire.

---

## Compliance theatre vs real compliance

A staff-level skill: distinguishing performative compliance from actual security.

```
Compliance theatre:
  - SOC 2 certified but production passwords in Slack
  - Encryption everywhere but keys committed to git
  - "Strong password policy" but no MFA on prod admin accounts
  - Audit logs collected but never reviewed
  - Pen test results filed; findings not fixed

Real compliance:
  - Frameworks drive genuine security improvements
  - Controls match documented policy
  - Findings tracked and remediated
  - Security incidents lead to improvements
  - Engineers feel security is supported, not blocked
```

Auditors are explicitly told **not** to dig past the documentation. They'll find SOC 2 satisfactory in either case. But the real security posture is what determines whether you have an actual incident.

---

## Common compliance pitfalls

| Pitfall | Better |
|---|---|
| Treat compliance as one-time event | Continuous monitoring (Vanta-style) |
| Compliance team separate from engineering | Engineering owns controls; compliance audits |
| Hard-coded credentials in repos | Secrets manager from day 1 |
| PII in logs | Scrub at source; structured logging |
| Same DB for all data classifications | Separate stores; encryption at rest minimum |
| Vendor management as spreadsheet | Sub-processor registry tool |
| "We'll deal with GDPR if a user asks" | Build user-data-export and deletion endpoints from day 1 |
| Backups retained forever | Defined retention policy; automatic expiry |
| Audit logs never reviewed | Quarterly access reviews |
| All PII collected "in case we need it" | Data minimisation; collect only what's used |

---

## Architecture patterns for compliance

### Pattern 1: Per-tenant data residency

```
Each tenant assigned a home region (US, EU, APAC).
Data lives only in home region.
Application routing routes user requests to their region.
Backups, encryption keys, logs: all region-local.
```

For multi-tenant SaaS with global customers. Mandatory for many enterprise contracts.

### Pattern 2: Encryption hierarchy

```
Data classification → encryption requirement:
  Public:        in transit (TLS) only
  Internal:      + at rest (AES-256, KMS)
  Confidential:  + per-environment KMS keys
  Restricted:    + per-tenant or per-user keys
```

Crypto-shredding becomes possible at the higher tiers.

### Pattern 3: Defense in depth

```
Layer 1: Network (VPC, security groups, WAF)
Layer 2: Identity (SSO, MFA, IAM roles)
Layer 3: Data (encryption, access controls, audit logs)
Layer 4: Application (input validation, auth, authorization)
Layer 5: Operations (least privilege, just-in-time access)

No single layer is enough; combinations work.
```

### Pattern 4: Separate audit infrastructure

```
Audit logs stored in:
  - Separate AWS account (compromise of main account doesn't expose audit)
  - Immutable storage (S3 with Object Lock; can't be deleted before retention)
  - Encrypted with separate KMS keys (controlled by security team)
```

Critical: an attacker who compromises your app can't tamper with logs of their activity.

---

## Working with compliance / GRC / legal teams

```
Mindset:
  Compliance is a constraint, not an obstacle.
  Treat compliance / GRC / legal as partners.
  Bring them in early on architecture decisions.

Anti-patterns:
  ✗ Engineers ignore compliance until audit
  ✗ Compliance imposes rules engineers can't follow
  ✗ Each side blames the other
```

Best companies have **compliance built into engineering workflows**: required reviews for changes affecting data flows; security review for new services; standard patterns documented and easy to follow.

---

## Cost of compliance

```
SOC 2 Type II:        ~$15K-50K/year for audit + tools (e.g., Vanta $20-50K)
PCI-DSS Level 1:      $50K-150K/year for QSA + tools + scans
HIPAA:                Lower direct cost; large opportunity cost in restrictions
GDPR:                 Indirect: engineering + legal time

Total at mid-stage SaaS: $100-300K/year + engineering time

Plus: limits on tools / vendors you can use (HIPAA / data residency)
Plus: longer sales cycles for enterprise (compliance review)
```

Worth factoring into B2B SaaS budgets early. Don't get caught flat-footed when a deal demands SOC 2 Type II.

---

## Quick reference

```
"We're getting our first SOC 2"      → Vanta / Drata; engineer access controls + audit logs + change mgmt
"We need GDPR compliance"            → data inventory; export + delete endpoints; DPAs; transparency
"We're handling credit cards"        → tokenise via Stripe; never touch card data
"We're a healthcare BAA"             → BAAs with cloud + sub-processors; PHI-only in eligible services
"EU users complain about residency"  → per-tenant region; data containment; explicit DPAs
"Right to be forgotten request"      → hard delete + crypto-shred + retention policies
"Audit logs requirement"             → CloudTrail + immutable S3 storage + separate account
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you can design systems that handle compliance as architectural constraints — not retrofit them under audit pressure.

**Strong answer pattern:**
1. Compliance shapes data flow, not just access control
2. Tokenisation / data minimisation reduce PCI/PHI scope
3. Crypto-shredding for GDPR right-to-be-forgotten where data can't be deleted
4. Per-tenant region for data residency
5. Audit logs in separate infrastructure (compromise-resistant)
6. SOC 2 = process assurance; doesn't mean secure; still valuable

**Common follow-up:** *"You're building a B2B SaaS. EU customers ask about data residency. How do you architect for it?"*
> Per-tenant region. Each tenant signs up; we assign a home region based on signup or explicit selection. Their data lives only in that region: live OLTP, replicas, backups, logs, archives. Application routing layer (CloudFront or our own router) sends each request to the tenant's home region based on tenant_id lookup. Operational data (admin, billing) is its own concern — usually centralised but minimised. We disclose sub-processors per region (different vendors may be used). Customer support tooling respects same boundaries; agents can only see tenants from their assigned regions. This is a significant cost (2-3× infrastructure for multi-region) so we price it as an enterprise feature.

---

## Related

- [Multi-Region Architecture](../architecture/multi-region.md) — for data residency
- [Multi-Tenancy](../architecture/multi-tenancy.md) — per-tenant patterns
- [Encryption](encryption.md) — at-rest, in-transit, key management
- [Secrets Management](secrets-management.md) — secrets in compliance posture
- [Zero Trust](zero-trust.md) — access control model
- [Threat Modelling](threat-modelling.md) — security architecture
- [Architecture Politics](../architecture/architecture-politics.md) — convincing leadership to invest
