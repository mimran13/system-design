# Fintech

<div class="sec-hero" markdown>
<span class="ey">Fintech · money movement</span>
The flows behind moving money: how card payments actually work end to end, what happens in the seconds between "Pay now" and "Order confirmed", and the regulatory machinery (SCA, PSD2, PCI-DSS) that shapes the architecture.
</div>

This section is **rails-focused** — the protocols and actors between merchant and bank. For designing your own payment *system* (ledger, idempotency, reconciliation), see the [Payment System case study](../case-studies/payment-system.md). For charging customers as a SaaS, see [Billing & Metering](../architecture/billing-metering.md).

## Roadmap

Start with the four-party model, then trace authentication, then keep the glossary open as a reference.

<div class="sd-mermaid-links" data-links='{
  "Card Payments Fundamentals": "card-payments-fundamentals/",
  "3D Secure Flow": "3ds-flow/",
  "Fintech Glossary": "glossary/"
}'></div>

```mermaid
flowchart TD
    A["Card Payments Fundamentals"] --> B["3D Secure Flow"]
    B -.-> B1["Fintech Glossary"]
    class A,B core
    class B1 opt
    classDef core fill:#2563eb,stroke:#1d4ed8,color:#fff;
    classDef opt fill:#ffffff,stroke:#a1a1aa,color:#18181b;
```

## The flows

<div class="pcards">
<a class="pcard" href="card-payments-fundamentals/"><span class="t">Card Payments Fundamentals</span><span class="d">The four-party model, authorization vs capture vs settlement, interchange, chargebacks, tokenization — the foundation every other flow builds on</span></a>
<a class="pcard" href="3ds-flow/"><span class="t">3D Secure (3DS) Flow</span><span class="d">Why Amazon shows "waiting" while Revolut pings your phone — frictionless vs challenge, ACS, liability shift, SCA</span></a>
<a class="pcard" href="glossary/"><span class="t">Fintech Glossary</span><span class="d">Every term for review: issuer, acquirer, interchange, clearing, CIT/MIT, nostro/vostro, EMI, rails — grouped by category</span></a>
</div>

## How the pieces fit

```mermaid
graph TD
    Checkout[Customer hits Pay] --> Auth3DS[3D Secure authentication<br/>is this really the cardholder?]
    Auth3DS --> AuthZ[Authorization<br/>does the issuer approve the charge?]
    AuthZ --> Capture[Capture<br/>merchant claims the money]
    Capture --> Clearing[Clearing<br/>networks exchange transaction files]
    Clearing --> Settlement[Settlement<br/>money actually moves between banks]
    Settlement --> Recon[Reconciliation<br/>did everything match?]

    AuthZ -.later, maybe.-> Chargeback[Chargeback / dispute]
```

Authentication (3DS) and authorization are **separate steps** that are easy to conflate: 3DS proves *who you are*; authorization decides *whether the charge is approved*. The Revolut popup belongs to the first; the final "payment successful" on the merchant page requires both.

## Coming later

Candidates for this section as it grows: open banking (PIS/AIS), bank transfer rails (SEPA Instant, ACH, FedNow), wallet payments and network tokenization (Apple Pay / Google Pay), payouts and ledger design, AML/KYC engineering, reconciliation at scale.

## Related

- [Payment System case study](../case-studies/payment-system.md) — ledger, exactly-once, internal design
- [Billing & Metering Engineering](../architecture/billing-metering.md) — subscription/usage billing on top of these rails
- [Idempotency](../patterns/idempotency.md) — non-negotiable for anything touching money
- [Compliance & Regulatory Engineering](../security/compliance-regulatory-engineering.md) — PCI-DSS scope reduction
