# Design a Payment System

## Problem statement

Design a payment processing system that:
- Processes payments between users (send money, pay for goods)
- Handles 1 million transactions per day
- Guarantees exactly-once processing — no double charges, no lost payments
- Maintains an accurate, auditable ledger
- Integrates with external payment providers (Stripe, banks)
- Supports refunds, disputes, and reconciliation

## Clarifying questions

```
1. Peer-to-peer or merchant payments?
   → Both: user-to-user transfers and checkout payments to merchants.

2. Which currencies / countries?
   → Multi-currency support; focus on USD for core design.

3. What's the transaction value range?
   → $0.01 to $100,000. Most transactions < $1,000.

4. Regulatory requirements?
   → PCI-DSS for card data; SOX for financial records; AML/KYC for
     user identity. We won't store raw card numbers — delegate to
     Stripe/payment processors.

5. Consistency requirement?
   → Strict. A payment must never be charged twice, never be lost.
     We accept higher latency for this guarantee.

6. Availability?
   → 99.99% uptime for the payment API. Brief degradation acceptable
     during maintenance windows with notice.
```

## Scale estimation

```
1M transactions/day = ~12 TPS average, ~50 TPS peak
Transaction record: ~1KB
Storage: 1M × 1KB × 365 = ~365GB/year (trivially small)

The scale challenge here is NOT volume — it's correctness.
A high-traffic social feed can tolerate lost events.
A payment system cannot. Every transaction must be exactly-once.

Key complexity: integrating with external systems (banks, payment
processors) that have their own failure modes, while maintaining
a consistent internal ledger.
```

---

## Core concept: Double-entry bookkeeping

Every payment system since 15th-century Venice uses double-entry bookkeeping. For every transaction, an equal debit and credit are recorded — the books always balance.

```
Single-entry (wrong):
  "Alice paid $100 to Bob"
  Just one record. Hard to detect errors. Can't audit.

Double-entry (correct):
  "Alice's account: -$100 (debit)"
  "Bob's account:   +$100 (credit)"
  
  The sum of all debits = sum of all credits. Always.
  If they don't balance → bug detected immediately.

In code, every transfer creates two ledger entries:
  - Debit from source account
  - Credit to destination account
  
  They are committed atomically. Partial commits are impossible.
```

---

## Data model

```sql
-- Accounts: every entity that can hold money
CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL,          -- user or merchant
    owner_type      VARCHAR(20) NOT NULL,   -- 'user', 'merchant', 'system'
    currency        CHAR(3) NOT NULL,       -- 'USD', 'EUR', etc.
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Ledger: immutable record of every money movement
-- NEVER UPDATE or DELETE rows here. Append only.
CREATE TABLE ledger_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES accounts(id),
    transaction_id  UUID NOT NULL,          -- groups debit + credit pair
    entry_type      VARCHAR(10) NOT NULL,   -- 'debit' or 'credit'
    amount          BIGINT NOT NULL,        -- in smallest unit (cents), always positive
    currency        CHAR(3) NOT NULL,
    balance_after   BIGINT NOT NULL,        -- snapshot balance after this entry
    description     TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Transactions: the business event that caused ledger entries
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,  -- client-provided, prevents duplicates
    from_account_id UUID REFERENCES accounts(id),
    to_account_id   UUID REFERENCES accounts(id),
    amount          BIGINT NOT NULL,        -- cents
    currency        CHAR(3) NOT NULL,
    status          VARCHAR(20) NOT NULL,   -- 'pending', 'completed', 'failed', 'reversed'
    type            VARCHAR(30) NOT NULL,   -- 'transfer', 'payment', 'refund', 'fee'
    external_ref    VARCHAR(255),           -- Stripe charge ID, bank ref, etc.
    metadata        JSONB,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Idempotency keys: short-circuit duplicate requests
CREATE TABLE idempotency_keys (
    key             VARCHAR(255) PRIMARY KEY,
    transaction_id  UUID NOT NULL,
    response_body   JSONB NOT NULL,         -- cache the full response
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ledger_account ON ledger_entries(account_id, created_at DESC);
CREATE INDEX idx_transactions_from ON transactions(from_account_id, created_at DESC);
CREATE INDEX idx_transactions_status ON transactions(status) WHERE status = 'pending';
```

---

## Component 1: Idempotency — the most important pattern

Networks fail. Clients retry. Without idempotency, a retry becomes a double charge.

```python
import uuid
import json
from decimal import Decimal

class PaymentService:
    def __init__(self, db, ledger: 'LedgerService'):
        self.db = db
        self.ledger = ledger

    def transfer(
        self,
        idempotency_key: str,
        from_account_id: str,
        to_account_id: str,
        amount_cents: int,
        currency: str = 'USD',
        description: str = None,
    ) -> dict:
        """
        Transfer money from one account to another.
        Idempotent: calling with the same key returns the same result.
        """
        # ── Step 1: Check idempotency key ────────────────────────────
        cached = self._get_cached_response(idempotency_key)
        if cached:
            return cached  # Return exact same response as first call

        # ── Step 2: Validate ─────────────────────────────────────────
        if amount_cents <= 0:
            raise ValueError("Amount must be positive")
        if from_account_id == to_account_id:
            raise ValueError("Cannot transfer to same account")

        # ── Step 3: Execute transfer in a single DB transaction ───────
        try:
            with self.db.transaction():
                # Check balance (with row lock to prevent concurrent overdraft)
                balance = self.ledger.get_balance(
                    from_account_id, currency, for_update=True
                )
                if balance < amount_cents:
                    raise InsufficientFundsError(
                        f"Balance {balance} < required {amount_cents}"
                    )

                # Create the transaction record
                transaction_id = str(uuid.uuid4())
                self.db.execute("""
                    INSERT INTO transactions
                        (id, idempotency_key, from_account_id, to_account_id,
                         amount, currency, status, type)
                    VALUES (%s, %s, %s, %s, %s, %s, 'completed', 'transfer')
                """, (transaction_id, idempotency_key, from_account_id,
                      to_account_id, amount_cents, currency))

                # Write double-entry ledger entries
                new_from_balance = balance - amount_cents
                to_balance = self.ledger.get_balance(to_account_id, currency)
                new_to_balance = to_balance + amount_cents

                self.db.execute("""
                    INSERT INTO ledger_entries
                        (account_id, transaction_id, entry_type, amount,
                         currency, balance_after)
                    VALUES
                        (%s, %s, 'debit',  %s, %s, %s),
                        (%s, %s, 'credit', %s, %s, %s)
                """, (
                    from_account_id, transaction_id, amount_cents, currency,
                    new_from_balance,
                    to_account_id, transaction_id, amount_cents, currency,
                    new_to_balance,
                ))

                # Cache the response for future duplicate requests
                response = {
                    'transaction_id': transaction_id,
                    'status': 'completed',
                    'amount': amount_cents,
                    'currency': currency,
                }
                self._cache_response(idempotency_key, response)

                return response

        except InsufficientFundsError:
            response = {
                'status': 'failed',
                'reason': 'insufficient_funds',
            }
            self._cache_response(idempotency_key, response)
            return response

    def _get_cached_response(self, key: str) -> dict | None:
        row = self.db.query_one(
            "SELECT response_body FROM idempotency_keys WHERE key = %s", (key,)
        )
        return row['response_body'] if row else None

    def _cache_response(self, key: str, response: dict):
        self.db.execute(
            """INSERT INTO idempotency_keys (key, transaction_id, response_body)
               VALUES (%s, %s, %s)
               ON CONFLICT (key) DO NOTHING""",
            (key, response.get('transaction_id'), json.dumps(response))
        )
```

---

## Component 2: Ledger service

```python
class LedgerService:
    def __init__(self, db):
        self.db = db

    def get_balance(
        self, account_id: str, currency: str, for_update: bool = False
    ) -> int:
        """
        Get current balance by summing ledger entries.
        
        We use balance_after snapshot for performance — just read
        the most recent entry's balance_after instead of summing all history.
        """
        lock_clause = "FOR UPDATE" if for_update else ""
        row = self.db.query_one(f"""
            SELECT balance_after
            FROM ledger_entries
            WHERE account_id = %s AND currency = %s
            ORDER BY created_at DESC
            LIMIT 1
            {lock_clause}
        """, (account_id, currency))

        return row['balance_after'] if row else 0

    def get_transaction_history(
        self,
        account_id: str,
        limit: int = 50,
        before_id: str = None,
    ) -> list[dict]:
        """Paginated transaction history for an account."""
        cursor_clause = ""
        params = [account_id]

        if before_id:
            cursor_clause = "AND le.id < %s"
            params.append(before_id)

        params.append(limit)

        return self.db.query(f"""
            SELECT
                le.id,
                le.transaction_id,
                le.entry_type,
                le.amount,
                le.balance_after,
                le.created_at,
                t.type AS transaction_type,
                t.description,
                t.from_account_id,
                t.to_account_id
            FROM ledger_entries le
            JOIN transactions t ON t.id = le.transaction_id
            WHERE le.account_id = %s {cursor_clause}
            ORDER BY le.created_at DESC
            LIMIT %s
        """, params)

    def verify_ledger_integrity(self, account_id: str) -> bool:
        """
        Audit check: recompute balance from scratch and compare to snapshots.
        Run periodically, not on every request.
        """
        entries = self.db.query("""
            SELECT entry_type, amount, balance_after
            FROM ledger_entries
            WHERE account_id = %s
            ORDER BY created_at ASC
        """, (account_id,))

        running_balance = 0
        for entry in entries:
            if entry['entry_type'] == 'credit':
                running_balance += entry['amount']
            else:
                running_balance -= entry['amount']

            if running_balance != entry['balance_after']:
                return False  # Integrity violation!

        return True
```

---

## Component 3: External payment provider integration

Real payments involve external systems (Stripe, banks). These are unreliable — requests can time out without knowing if they succeeded.

```python
import stripe
from enum import Enum

class PaymentStatus(Enum):
    PENDING   = 'pending'
    COMPLETED = 'completed'
    FAILED    = 'failed'

class ExternalPaymentService:
    """
    Handles payments that go through an external processor (Stripe).
    The challenge: Stripe may charge the card but the response may
    not reach us. We must handle this without double-charging.
    """

    def __init__(self, db, payment_service: PaymentService):
        self.db = db
        self.payment = payment_service

    def charge_card(
        self,
        idempotency_key: str,
        user_id: str,
        amount_cents: int,
        currency: str,
        stripe_payment_method_id: str,
    ) -> dict:
        """
        Charge a card via Stripe, then credit the user's internal account.
        Uses Stripe's idempotency key to prevent double charges.
        """

        # ── Step 1: Create transaction record in PENDING state ────────
        transaction_id = self._create_pending_transaction(
            idempotency_key, user_id, amount_cents, currency
        )

        # ── Step 2: Call Stripe with its own idempotency key ──────────
        # If this times out, we can safely retry with the same key.
        # Stripe guarantees: same key = same result (no double charge).
        try:
            stripe_charge = stripe.PaymentIntent.create(
                amount=amount_cents,
                currency=currency.lower(),
                payment_method=stripe_payment_method_id,
                confirm=True,
                idempotency_key=f"charge:{idempotency_key}",  # Stripe's key
            )

            if stripe_charge.status == 'succeeded':
                # ── Step 3: Credit internal account + mark completed ──
                self._complete_charge(
                    transaction_id, user_id, amount_cents, currency,
                    external_ref=stripe_charge.id
                )
                return {'status': 'completed', 'transaction_id': transaction_id}

            else:
                self._fail_transaction(transaction_id, stripe_charge.status)
                return {'status': 'failed', 'reason': stripe_charge.status}

        except stripe.error.CardError as e:
            self._fail_transaction(transaction_id, str(e.code))
            return {'status': 'failed', 'reason': str(e.code)}

        except stripe.error.StripeError as e:
            # Network error or timeout — we don't know if Stripe charged.
            # Mark as pending. A background job will reconcile.
            self._mark_needs_reconciliation(transaction_id)
            raise  # Let caller handle the retry

    def _create_pending_transaction(
        self, idempotency_key, user_id, amount_cents, currency
    ) -> str:
        transaction_id = str(uuid.uuid4())
        self.db.execute("""
            INSERT INTO transactions
                (id, idempotency_key, to_account_id, amount, currency, status, type)
            VALUES (%s, %s, (SELECT id FROM accounts WHERE owner_id = %s LIMIT 1),
                    %s, %s, 'pending', 'payment')
            ON CONFLICT (idempotency_key) DO NOTHING
        """, (transaction_id, idempotency_key, user_id, amount_cents, currency))
        return transaction_id

    def _complete_charge(
        self, transaction_id, user_id, amount_cents, currency, external_ref
    ):
        """Atomically: credit internal account + mark transaction complete."""
        with self.db.transaction():
            # Get system account (where card charges originate)
            system_account = self._get_system_account(currency)
            user_account = self._get_user_account(user_id, currency)

            # Credit user account
            current_balance = self.payment.ledger.get_balance(
                user_account, currency, for_update=True
            )
            new_balance = current_balance + amount_cents

            self.db.execute("""
                INSERT INTO ledger_entries
                    (account_id, transaction_id, entry_type, amount,
                     currency, balance_after)
                VALUES (%s, %s, 'credit', %s, %s, %s)
            """, (user_account, transaction_id, amount_cents, currency, new_balance))

            # Update transaction status
            self.db.execute("""
                UPDATE transactions
                SET status = 'completed', external_ref = %s, updated_at = NOW()
                WHERE id = %s
            """, (external_ref, transaction_id))
```

---

## Component 4: Reconciliation

External systems sometimes succeed without us knowing. Reconciliation is the background process that finds and fixes these discrepancies.

```python
import datetime

class ReconciliationService:
    """
    Runs periodically (every few minutes) to:
    1. Find transactions stuck in 'pending' state
    2. Query Stripe to get their actual status
    3. Complete or fail them accordingly
    """

    def __init__(self, db, stripe_client, external_payment: ExternalPaymentService):
        self.db = db
        self.stripe = stripe_client
        self.external = external_payment

    def reconcile_pending_transactions(self, older_than_seconds: int = 60):
        """Fix transactions that are stuck in pending."""
        cutoff = datetime.datetime.utcnow() - datetime.timedelta(
            seconds=older_than_seconds
        )

        pending = self.db.query("""
            SELECT id, external_ref, amount, currency, to_account_id
            FROM transactions
            WHERE status = 'pending'
              AND created_at < %s
            LIMIT 100
        """, (cutoff,))

        for txn in pending:
            self._reconcile_one(txn)

    def _reconcile_one(self, txn: dict):
        if not txn['external_ref']:
            # No Stripe ID → charge never reached Stripe → safe to fail
            self.db.execute(
                "UPDATE transactions SET status = 'failed' WHERE id = %s",
                (txn['id'],)
            )
            return

        # Query Stripe for the actual status
        try:
            stripe_charge = stripe.PaymentIntent.retrieve(txn['external_ref'])

            if stripe_charge.status == 'succeeded':
                # Stripe charged successfully but we didn't record it
                # → Complete the transaction now
                self.external._complete_charge(
                    transaction_id=txn['id'],
                    user_id=None,  # get from account
                    amount_cents=txn['amount'],
                    currency=txn['currency'],
                    external_ref=txn['external_ref'],
                )

            elif stripe_charge.status in ('canceled', 'requires_payment_method'):
                self.db.execute(
                    "UPDATE transactions SET status = 'failed' WHERE id = %s",
                    (txn['id'],)
                )

            # If still 'processing' on Stripe side: leave pending, retry later

        except stripe.error.StripeError:
            pass  # Try again next reconciliation cycle
```

---

## Architecture overview

```
Client
  │
  ├── Payment API (ECS Fargate)
  │   POST /v1/payments
  │   POST /v1/transfers
  │   GET  /v1/accounts/{id}/balance
  │   GET  /v1/accounts/{id}/transactions
  │
  │   → Validates idempotency key (Redis check first, then DB)
  │   → Routes to PaymentService or ExternalPaymentService
  │
  ├── Internal Transfers ──────────────────────────────────────────┐
  │   Pure DB transaction                                          │
  │   (double-entry ledger, no external calls)                    │
  │                                                                │
  ├── External Payments ───────────────────────────────────────────┤
  │   DB (pending) → Stripe API → DB (completed)                  │
  │   Idempotency key passed to Stripe                            │
  │                                                                │
  └── Reconciliation Worker (cron every 2 min) ───────────────────┘
      Finds stuck 'pending' → queries Stripe → completes or fails

Database: Aurora PostgreSQL (Multi-AZ)
  - SERIALIZABLE isolation for balance checks + ledger writes
  - Point-in-time recovery enabled (35 days)
  - Read replica for balance queries, reports

Idempotency cache: ElastiCache Redis
  - Check Redis first (fast path)
  - Fall through to DB if not in cache (authoritative)

Audit log: All ledger_entries shipped to S3 + Athena
  - Immutable audit trail for compliance
  - 7-year retention (SOX requirement)
```

---

## Handling refunds

```python
def refund(
    self,
    original_transaction_id: str,
    idempotency_key: str,
    amount_cents: int = None,  # None = full refund
) -> dict:
    """
    Refund a completed transaction.
    Creates new ledger entries — never modifies original.
    """
    # Get original transaction
    original = self.db.query_one(
        "SELECT * FROM transactions WHERE id = %s", (original_transaction_id,)
    )
    if not original or original['status'] != 'completed':
        raise ValueError("Can only refund completed transactions")

    refund_amount = amount_cents or original['amount']
    if refund_amount > original['amount']:
        raise ValueError("Refund cannot exceed original amount")

    # Idempotency check
    cached = self._get_cached_response(idempotency_key)
    if cached:
        return cached

    with self.db.transaction():
        refund_id = str(uuid.uuid4())

        # Reverse the original entries
        # Original: debit from_account, credit to_account
        # Refund:   credit from_account, debit to_account
        from_balance = self.ledger.get_balance(
            original['from_account_id'], original['currency'], for_update=True
        )
        to_balance = self.ledger.get_balance(
            original['to_account_id'], original['currency'], for_update=True
        )

        self.db.execute("""
            INSERT INTO ledger_entries
                (account_id, transaction_id, entry_type, amount, currency, balance_after)
            VALUES
                (%s, %s, 'credit', %s, %s, %s),
                (%s, %s, 'debit',  %s, %s, %s)
        """, (
            original['from_account_id'], refund_id, refund_amount,
            original['currency'], from_balance + refund_amount,
            original['to_account_id'], refund_id, refund_amount,
            original['currency'], to_balance - refund_amount,
        ))

        self.db.execute("""
            INSERT INTO transactions
                (id, idempotency_key, from_account_id, to_account_id,
                 amount, currency, status, type)
            VALUES (%s, %s, %s, %s, %s, %s, 'completed', 'refund')
        """, (refund_id, idempotency_key, original['to_account_id'],
              original['from_account_id'], refund_amount, original['currency']))

        response = {'transaction_id': refund_id, 'status': 'completed'}
        self._cache_response(idempotency_key, response)
        return response
```

---

## Interview talking points

!!! tip "Key design decisions to discuss"
    1. **Idempotency keys** — the client provides a unique key per payment attempt. Same key = same result, no double charge. Store key + response in DB; Redis is a fast-path cache. This is the single most important pattern in payment systems
    2. **Double-entry bookkeeping** — every transaction creates two ledger entries (debit + credit). The books always balance. Never update or delete ledger rows — append only. This is how you audit and detect bugs
    3. **Pending → Completed state machine** — never call Stripe and update DB in the same operation without a pending state in between. If Stripe times out, the pending record lets reconciliation fix it later
    4. **Reconciliation** — a background worker that queries Stripe for stuck pending transactions. This is how you handle the case where Stripe charged but our response never arrived
    5. **SERIALIZABLE isolation** — balance checks + ledger writes must use `SELECT ... FOR UPDATE` + serializable transactions. Otherwise two concurrent payments can overdraft the same account
    6. **Store amounts as integers (cents)** — never floating point for money. `$1.99 → 199 cents`. Floating point arithmetic is non-deterministic for financial calculations

## Related topics

- [Idempotency](../patterns/idempotency.md) — idempotency key pattern in depth
- [Saga Pattern](../patterns/saga-pattern.md) — multi-step payment flows across services
- [Distributed Transactions](../distributed/distributed-transactions.md) — why 2PC is avoided in payment microservices
- [Outbox Pattern](../patterns/outbox.md) — reliable event publishing after payment completion
- [ACID vs BASE](../fundamentals/acid-vs-base.md) — payments require ACID, not eventual consistency
