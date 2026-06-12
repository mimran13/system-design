# Fintech Glossary

Every term you'll meet in payments and banking conversations, grouped for review. One-to-two-line definitions — follow the links for mechanics.

## The actors

| Term | Definition |
|---|---|
| **Cardholder** | The customer holding the card; has an account with the issuer |
| **Merchant** | The business selling goods/services and accepting the payment (Amazon) |
| **Issuer / issuing bank** | The cardholder's bank — issued the card, holds the funds, approves or declines each transaction, takes credit and fraud risk (Revolut, Chase) |
| **Acquirer / acquiring bank** | The merchant's bank — onboards merchants, accepts card transactions on their behalf, assumes merchant risk (Adyen, Worldpay, Elavon) |
| **Card network / scheme** | Visa, Mastercard, Amex — run the message switch between acquirers and issuers and set the rulebook + interchange. They route messages; they don't hold money |
| **PSP (Payment Service Provider)** | Developer-facing layer bundling gateway + acquiring + fraud tooling into one API (Stripe, Adyen, Checkout.com) |
| **Payment gateway** | The technical component that captures payment data at checkout and forwards it for processing — today usually one feature of a PSP |
| **Processor** | The infrastructure that actually moves the ISO 8583/20022 messages for issuers or acquirers (issuer-processor: Marqeta, Thought Machine adjacent; acquirer-processor: First Data/Fiserv) |
| **Payment facilitator (payfac)** | Aggregates many small merchants under its own master merchant account so they don't each need an acquirer relationship (Square, Stripe) |
| **ISO (Independent Sales Organization)** | Resells acquiring services to merchants on behalf of an acquirer; lighter-weight than a payfac |
| **3DS Server** | Merchant-side component initiating 3D Secure authentication ([3DS flow](3ds-flow.md)) |
| **Directory Server (DS)** | Card-network switchboard routing 3DS messages to the right issuer |
| **ACS (Access Control Server)** | Issuer-side component that risk-scores, challenges the cardholder, and issues the authentication proof |

## Banking flavors

| Term | Definition |
|---|---|
| **Retail banking** | Banking for individual consumers — current accounts, cards, mortgages, savings |
| **Commercial / corporate banking** | Banking for businesses — lending, treasury, trade finance |
| **Private banking** | Banking + wealth management for high-net-worth individuals |
| **Investment banking** | Capital markets: underwriting, M&A advisory, trading — not deposit banking |
| **Neobank / challenger bank** | App-first bank without branches (Revolut, N26, Monzo); may hold a full banking licence or operate as an EMI |
| **EMI (Electronic Money Institution)** | Licensed to hold customer funds as e-money and provide payment services, but not to lend them out; many fintechs start here |
| **BaaS (Banking-as-a-Service)** | Licensed banks exposing accounts/cards/payments as APIs so non-banks can embed them (Solaris, Griffin) |
| **Correspondent bank** | A bank providing services (esp. cross-border) on behalf of another bank that lacks presence in that market |

## Transaction lifecycle

| Term | Definition |
|---|---|
| **Authorization (auth)** | Real-time issuer approval placing a *hold* on cardholder funds — no money moves yet |
| **Capture** | Merchant claims a previous auth (full or partial); triggers clearing. Hotels: auth at check-in, capture at checkout |
| **Void** | Cancel an auth before capture — free, instant, releases the hold |
| **Refund** | Return money after capture — a new, fee-bearing money movement back to the cardholder |
| **Clearing** | Batched exchange of transaction records between acquirers and issuers via the network |
| **Settlement** | Actual interbank movement of (netted) funds — typically T+1 to T+3 |
| **Payout** | The acquirer/PSP paying accumulated funds to the merchant's bank account |
| **Reconciliation** | Matching internal ledger ↔ PSP reports ↔ bank statements; the daily "does everything add up" job |
| **Pre-authorization** | Auth for an estimated amount before the final is known (fuel pumps, hotels) |
| **Incremental authorization** | Topping up an existing auth (hotel extends a stay) |
| **AVS (Address Verification Service)** | Checks the billing address against the issuer's records during auth |
| **Standing order** | Customer-instructed fixed recurring bank transfer |
| **Direct debit** | Merchant-pulled recurring bank payment under a customer mandate (SEPA DD, BACS DD) |

## Identifiers & data

| Term | Definition |
|---|---|
| **PAN (Primary Account Number)** | The 14-19 digit card number; the thing PCI-DSS is about |
| **BIN / IIN** | First 6-8 digits of the PAN — identifies the issuer, card type, and country; drives routing and risk rules |
| **CVV/CVC** | The 3-4 digit security code proving physical card possession in CNP payments; never storable, even encrypted |
| **Expiry date** | Card validity; updated via account-updater services when cards are reissued |
| **MID (Merchant ID)** | The merchant's account identifier with its acquirer |
| **ARN (Acquirer Reference Number)** | Unique ID tracing a cleared transaction through the network — what support teams use to "find the money" |
| **STAN / RRN** | System trace / retrieval reference numbers on ISO 8583 messages |
| **IBAN** | International bank account number (account-level addressing, EU-centric) |
| **BIC / SWIFT code** | Bank-level identifier used in SWIFT messaging |
| **ISO 8583** | The classic binary message format for card transactions ("0100 auth request") |
| **ISO 20022** | The modern XML/structured successor, standard for instant payment rails and increasingly for cards |

## Fees & economics

| Term | Definition |
|---|---|
| **Interchange** | Fee paid acquirer → issuer per transaction; set by the network; the largest slice of card costs. EU-capped (0.2% debit / 0.3% credit), much higher in the US |
| **Scheme fee** | The card network's own cut |
| **MDR (Merchant Discount Rate)** | Total percentage the merchant pays = interchange + scheme fee + acquirer/PSP markup |
| **Interchange++ pricing** | Transparent pricing: actual interchange + actual scheme fee + fixed markup (vs "blended" flat rates like 2.9% + 30¢) |
| **Rolling reserve** | Acquirer withholds a % of payouts for months as a buffer against future chargebacks |
| **Float** | Money in transit you temporarily hold (and could earn interest on) between collection and payout |
| **FX margin** | Spread added to the exchange rate on cross-currency transactions — often the real revenue in "free" FX products |

## Fraud, risk & disputes

| Term | Definition |
|---|---|
| **CNP (Card Not Present)** | Online/phone transactions — higher fraud risk, higher interchange, 3DS territory |
| **Chargeback** | Cardholder disputes via their issuer; funds are clawed back from the merchant pending evidence |
| **Representment** | The merchant's evidence submission to fight a chargeback |
| **Friendly fraud** | Cardholder disputes a legitimate purchase ("I don't recognize this" / buyer's remorse) — the majority of CNP disputes |
| **Liability shift** | With 3DS authentication, fraud chargeback liability moves merchant → issuer ([3DS flow](3ds-flow.md)) |
| **Chargeback ratio** | Disputes / transactions; above ~0.9% triggers network monitoring programs, fines, and eventually account termination |
| **Velocity checks** | Fraud rules on frequency: N transactions per card/IP/device per time window |
| **Decline codes** | Issuer responses: **hard declines** (stolen card — never retry) vs **soft declines** (insufficient funds, SCA required — retry with strategy) |
| **Dunning** | The retry-and-remind process for failed recurring payments |

## Authentication & security

| Term | Definition |
|---|---|
| **3D Secure (3DS)** | The authentication protocol behind "approve in your banking app" — see the [full flow](3ds-flow.md) |
| **SCA (Strong Customer Authentication)** | PSD2's two-of-three-factors requirement (knowledge / possession / inherence) |
| **PSD2** | EU payment services directive: mandates SCA, enables open banking |
| **Frictionless flow** | 3DS2 path where the issuer's risk engine authenticates silently — no challenge |
| **Challenge flow** | 3DS2 path requiring cardholder action (app push, OTP, biometric) |
| **CAVV / AAV** | The cryptogram proving a transaction was 3DS-authenticated; carried into authorization |
| **ECI** | E-commerce indicator flagging the authentication outcome (drives liability shift) |
| **OTP** | One-time password (SMS/email) — the weaker, fading challenge method |
| **Tokenization** | Replacing the PAN with a token: **vault tokens** (PSP-scoped) or **network tokens** (scheme-level, device-bound — Apple Pay/Google Pay) |
| **PCI-DSS** | The card-industry security standard; scope is everything that touches PANs — minimize via hosted fields + tokens |
| **SAQ-A / SAQ-D** | PCI self-assessment levels: A = card data fully outsourced (~20 controls); D = you touch PANs (300+) |
| **KYC (Know Your Customer)** | Identity verification at onboarding (documents, liveness, sanctions/PEP screening) |
| **AML (Anti-Money Laundering)** | Ongoing transaction monitoring + suspicious activity reporting obligations |

## Rails & transfers

| Term | Definition |
|---|---|
| **ACH** | US batch bank-transfer network — cheap, T+1/T+2, reversible window |
| **FedNow / RTP** | US instant-payment rails (24/7, seconds, irrevocable) |
| **SEPA Credit Transfer / SEPA Instant** | Euro-area bank transfers — batch (T+1) and instant (≤10s) variants |
| **Faster Payments** | The UK's instant rail |
| **Wire (SWIFT/Fedwire/TARGET2)** | High-value, bank-to-bank transfers; SWIFT is the messaging network between correspondent banks, not a settlement system itself |
| **Open banking** | Regulated APIs exposing bank accounts to third parties: **AIS** (account info) and **PIS** (payment initiation — "pay by bank") |
| **BNPL (Buy Now Pay Later)** | Klarna-style installment credit at checkout — the provider pays the merchant upfront and takes the credit risk |
| **Remittance** | Cross-border consumer money transfer (Wise, Remitly) — typically local-in, local-out with internal netting instead of SWIFT per transfer |
| **Nostro / vostro** | Mirror accounts banks hold with each other for cross-border settlement ("our account at your bank" / "your account at ours") |

## Money mechanics

| Term | Definition |
|---|---|
| **Ledger** | The append-only source of truth for money movements; double-entry: every debit has a matching credit ([case study](../case-studies/payment-system.md)) |
| **Double-entry bookkeeping** | Each transaction touches ≥2 accounts with balancing debits/credits — errors become visible as imbalance |
| **Idempotency key** | Client-supplied unique key making money operations safe to retry ([pattern](../patterns/idempotency.md)) |
| **Escrow** | Funds held by a neutral party until conditions are met (marketplaces) |
| **Mandate** | Customer's standing authorization for future merchant-initiated charges (direct debit mandates, card MIT mandates) |
| **CIT / MIT** | Customer-Initiated vs Merchant-Initiated Transaction — determines SCA applicability ([fundamentals](card-payments-fundamentals.md)) |
| **Authorization hold** | The temporary fund reservation an auth places — the "pending" line in your banking app |
| **Net settlement** | Banks settle the *net* of all mutual obligations rather than gross per transaction |
| **T+N** | Settlement timing notation: N business days after transaction day |

## Related

- [Card Payments Fundamentals](card-payments-fundamentals.md) — the actors and lifecycle in motion
- [3D Secure Flow](3ds-flow.md) — authentication terms in context
- [Payment System case study](../case-studies/payment-system.md) — ledger and idempotency design
- [Billing & Metering Engineering](../architecture/billing-metering.md) — dunning, mandates, pricing models
- [General Glossary](../glossary.md) — the system-design-wide term index
