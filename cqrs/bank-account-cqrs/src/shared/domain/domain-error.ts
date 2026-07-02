/**
 * DomainError — the base class for "the business rules said no".
 *
 * This is deliberately separate from HTTP concerns. The domain doesn't know
 * what a 400 or a 409 is; it only knows "you can't withdraw more than you have".
 * A thin exception filter (or the controller) maps these to HTTP status codes.
 * Keeping that mapping OUT of the domain is a core Clean Architecture idea:
 * the domain depends on nothing.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The account you asked for isn't there. */
export class AccountNotFoundError extends DomainError {
  constructor(accountId: string) {
    super(`Account ${accountId} does not exist`);
  }
}

/** You tried to take out more than the account holds — the key invariant. */
export class InsufficientFundsError extends DomainError {
  constructor(accountId: string) {
    super(`Account ${accountId} has insufficient funds for this withdrawal`);
  }
}

/** Amounts must be positive — you can't deposit £0 or a negative number. */
export class InvalidAmountError extends DomainError {
  constructor() {
    super('Amount must be greater than zero');
  }
}

/**
 * Two writers raced on the same aggregate and one lost.
 * Only meaningful in the event-sourced stage, where we use optimistic
 * concurrency (expected stream version) instead of row locks.
 */
export class ConcurrencyError extends DomainError {
  constructor(accountId: string, expected: number, actual: number) {
    super(
      `Concurrency conflict on ${accountId}: expected version ${expected}, ` +
        `store is at ${actual}. Reload and retry.`,
    );
  }
}
