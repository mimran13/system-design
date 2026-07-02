import { Money } from '../../shared/domain/money';
import { InsufficientFundsError, InvalidAmountError } from '../../shared/domain/domain-error';

/**
 * Account — the WRITE MODEL (a.k.a. the domain model / aggregate).
 *
 * This is a rich domain object, NOT an anaemic data bag. Notice there are no
 * public setters. The only way to change the balance is to go through a method
 * that enforces the business rules. That's the whole point of a write model:
 * it is the guardian of invariants.
 *
 * The one invariant here: **an account may never go negative.** Every path that
 * could break it (withdraw) checks it. Because the check lives INSIDE the model,
 * it's impossible for any command handler, controller, or future caller to
 * forget it. The rule can't leak.
 *
 * In THIS stage the account stores its balance directly (`this.balance`). That
 * stored number is the source of truth. Contrast that with Stage 2, where the
 * balance isn't stored at all — it's recomputed by replaying events.
 */
export class Account {
  private constructor(
    public readonly id: string,
    public readonly owner: string,
    private balance: Money,
  ) {}

  /** Factory for a brand-new account. Enforces the opening-balance rule. */
  static open(id: string, owner: string, openingBalance: Money): Account {
    if (openingBalance.isNegative()) {
      throw new InvalidAmountError();
    }
    return new Account(id, owner, openingBalance);
  }

  /** Rehydrate an existing account from stored state (used by the repository). */
  static rehydrate(id: string, owner: string, balance: Money): Account {
    return new Account(id, owner, balance);
  }

  deposit(amount: Money): void {
    if (amount.isZeroOrLess()) {
      throw new InvalidAmountError();
    }
    this.balance = this.balance.add(amount);
  }

  withdraw(amount: Money): void {
    if (amount.isZeroOrLess()) {
      throw new InvalidAmountError();
    }
    // The invariant, enforced at the only place it can be broken.
    if (amount.isGreaterThan(this.balance)) {
      throw new InsufficientFundsError(this.id);
    }
    this.balance = this.balance.subtract(amount);
  }

  getBalance(): Money {
    return this.balance;
  }
}
