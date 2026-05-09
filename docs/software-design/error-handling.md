# Error Handling Patterns

Good error handling is not just try/catch around everything. It defines the contract of your code — what can go wrong, who is responsible for recovery, and how failure information flows through the system.

---

## Errors vs Exceptions

A useful distinction:

| Type | Meaning | How to handle |
|---|---|---|
| **Domain error** | Expected failure, part of the business | Return as a value (Result type) |
| **Technical exception** | Unexpected failure, infrastructure-level | Throw and catch at boundaries |
| **Panic / Fatal** | Unrecoverable state | Let the process crash |

```python
# Domain error: "user not found" is expected — caller must handle it
def find_user(user_id: UserId) -> Optional[User]:
    ...

# Technical exception: DB connection failed — caller can't do anything useful
def find_user(user_id: UserId) -> User:
    # raises DatabaseConnectionError if DB is down
    ...
```

---

## Fail Fast

Validate inputs at system boundaries and fail immediately if they're invalid. Never let bad data travel deep into the system where the error context is lost.

```python
# BAD: validate late — by the time we fail, we've done work and lost context
def process_order(order_data: dict):
    items = fetch_items(order_data["item_ids"])     # DB call
    user = fetch_user(order_data["user_id"])        # DB call
    if not order_data.get("email"):                 # validate AFTER work done
        raise ValueError("Email required")

# GOOD: validate first, fail before doing any work
def process_order(order_data: dict):
    if not order_data.get("email"):
        raise ValueError("Email required")
    if not order_data.get("item_ids"):
        raise ValueError("Order must have at least one item")

    items = fetch_items(order_data["item_ids"])
    user = fetch_user(order_data["user_id"])
```

---

## The Result Type (Railway-Oriented Programming)

Instead of throwing exceptions for expected failures, return a Result that is either a success value or an error. The caller is forced to handle both cases.

```python
from dataclasses import dataclass
from typing import Generic, TypeVar, Union

T = TypeVar("T")
E = TypeVar("E")

@dataclass
class Ok(Generic[T]):
    value: T

@dataclass
class Err(Generic[E]):
    error: E

Result = Union[Ok[T], Err[E]]


# Domain function returns Result instead of raising
def withdraw(account: Account, amount: Money) -> Result[Account, str]:
    if amount.amount <= 0:
        return Err("Withdrawal amount must be positive")
    if account.balance < amount:
        return Err("Insufficient funds")
    return Ok(account.debit(amount))


# Caller is forced to handle both cases
result = withdraw(account, Money(Decimal("100"), "USD"))
match result:
    case Ok(updated_account):
        repo.save(updated_account)
    case Err(reason):
        raise InsufficientFundsError(reason)
```

**Languages with native Result types:**
- Rust: `Result<T, E>` — `?` operator for propagation
- Go: `(T, error)` return pattern
- Swift: `Result<Success, Failure>`
- Haskell/Scala: `Either[E, A]`

```rust
// Rust: idiomatic Result propagation
fn withdraw(account: &mut Account, amount: Money) -> Result<(), WithdrawError> {
    if account.balance < amount {
        return Err(WithdrawError::InsufficientFunds);
    }
    account.balance -= amount;
    Ok(())
}

fn process_transfer(from: &mut Account, to: &mut Account, amount: Money) -> Result<(), TransferError> {
    withdraw(from, amount)?;   // ? propagates Err automatically
    deposit(to, amount)?;
    Ok(())
}
```

---

## Exception hierarchy design

If using exceptions, design a clear hierarchy. Callers can catch at the right level of specificity.

```python
# Exception hierarchy
class AppError(Exception): pass          # base — catch at top level

class DomainError(AppError): pass        # expected business failures
class InsufficientFundsError(DomainError): pass
class OrderAlreadyConfirmedError(DomainError): pass
class UserNotFoundError(DomainError): pass

class InfrastructureError(AppError): pass   # unexpected failures
class DatabaseConnectionError(InfrastructureError): pass
class ExternalServiceError(InfrastructureError): pass

class ValidationError(AppError): pass    # input validation
```

```python
# API layer: translate exceptions to HTTP responses
@app.errorhandler(UserNotFoundError)
def handle_not_found(e):
    return {"error": str(e)}, 404

@app.errorhandler(ValidationError)
def handle_validation(e):
    return {"error": str(e)}, 400

@app.errorhandler(InfrastructureError)
def handle_infra(e):
    logger.exception("Infrastructure error", exc_info=e)
    return {"error": "Internal server error"}, 500
```

---

## Error propagation: don't swallow errors

Every swallowed exception is a hidden bug waiting to appear in production under the worst conditions.

```python
# BAD: swallowing exception — failure is invisible
def process_payment(order):
    try:
        charge_card(order.payment_method, order.total)
    except Exception:
        pass  # ← "it'll be fine"
    send_confirmation_email(order)  # ← sends email even if payment failed

# BAD: catching too broadly
try:
    result = do_something_risky()
except Exception as e:
    logger.error("Error", exc_info=e)
    return None  # ← caller has no idea what happened

# GOOD: catch what you can handle, let the rest propagate
def process_payment(order):
    try:
        charge_card(order.payment_method, order.total)
    except CardDeclinedError as e:
        raise PaymentFailedError(f"Card declined: {e.decline_code}") from e
    # DatabaseConnectionError, NetworkError — not caught here, propagate up
```

**The golden rule:** Only catch exceptions you know how to handle. Let everything else propagate to a layer that does.

---

## Error context: wrapping vs re-raising

Add context when propagating, don't lose the original cause.

```python
# BAD: losing the original exception
try:
    user = user_repo.get(user_id)
except Exception:
    raise RuntimeError("Failed to get user")   # ← traceback lost

# GOOD: wrap with context, preserve cause
try:
    user = user_repo.get(user_id)
except DatabaseError as e:
    raise UserRepositoryError(
        f"Failed to fetch user {user_id}"
    ) from e   # ← __cause__ preserved, full traceback available
```

```go
// Go: always wrap errors with context
user, err := userRepo.Get(ctx, userID)
if err != nil {
    return nil, fmt.Errorf("get user %s: %w", userID, err)
    //                                      ^^ wrap with %w for unwrapping
}
```

---

## Handling errors at system boundaries

Errors should be translated at each architectural boundary.

```
Database layer:     DatabaseError
    ↓ translate
Repository layer:   UserNotFoundError, OrderNotFoundError
    ↓ translate
Application layer:  DomainError (known) / InfrastructureError (unexpected)
    ↓ translate
API layer:          HTTP 404 / 400 / 500 with structured JSON body
    ↓ translate
Client:             User-facing message ("We couldn't find your order")
```

```python
# API layer translates domain errors to HTTP
class OrderController:
    def confirm_order(self, order_id: str):
        try:
            self.use_case.execute(OrderId(order_id))
            return {"status": "confirmed"}, 200

        except OrderNotFoundError:
            return {"error": "Order not found"}, 404

        except OrderAlreadyConfirmedError:
            return {"error": "Order is already confirmed"}, 409

        except PaymentDeclinedError as e:
            return {"error": f"Payment declined: {e.reason}"}, 402

        except Exception as e:
            logger.exception("Unexpected error confirming order")
            return {"error": "Internal server error"}, 500
```

---

## Idempotency and error recovery

For operations that can fail mid-way, design for safe retries.

```python
# BAD: charging twice if network fails after charge but before DB update
def confirm_order(order_id):
    charge_card(order.total)                  # succeeds
    order.status = "confirmed"                # network fails before this
    db.save(order)                            # never runs

# Retry: charges card again → double charge

# GOOD: check-then-act with idempotency key
def confirm_order(order_id, idempotency_key):
    # Idempotency key prevents double-charge even if retried
    if not payment_already_processed(idempotency_key):
        charge_card(order.total, idempotency_key=idempotency_key)
    order.status = "confirmed"
    db.save(order)
```

See [Patterns: Idempotency](../patterns/idempotency.md) for full patterns.

---

## Error messages: for humans vs machines

```python
# BAD: vague, not actionable
raise ValueError("Invalid input")

# GOOD: specific, actionable, includes the bad value
raise ValueError(
    f"Invalid email address '{email}': must contain exactly one '@' character"
)

# For APIs: structured error response
{
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "Invalid email address",
        "field": "email",
        "value": "alice-at-example.com",
        "hint": "Email must be in format: user@domain.com"
    }
}
```

---

## Interview angle

!!! tip "Error handling in system design"
    - *"What happens if the payment service times out mid-checkout?"* → Idempotency key on payment call. On retry, the payment service checks if the key was already processed — if yes, return success without charging again. Otherwise charge and record.
    - *"How do you distinguish a bug from expected behavior?"* → Domain errors (InsufficientFunds, OrderNotFound) are expected — return as values or specific exceptions, never log as ERROR. Infrastructure failures (DB down, network timeout) are unexpected — log with full context, alert on-call.
    - *"What's wrong with catching `Exception` everywhere?"* → You lose information about what failed. You can't distinguish a programming bug from a transient network issue. You end up returning null or empty values that fail later in unexpected ways.

## Related topics

- [Patterns: Retry & Timeout](../patterns/retry-timeout.md) — retrying failed operations safely
- [Patterns: Idempotency](../patterns/idempotency.md) — safe retries for state-changing operations
- [Patterns: Circuit Breaker](../patterns/circuit-breaker.md) — stopping calls to failing services
- [Observability: Logging](../observability/logging.md) — what and how to log errors
- [Clean Code Principles](clean-code-principles.md) — clear code, clear failures
