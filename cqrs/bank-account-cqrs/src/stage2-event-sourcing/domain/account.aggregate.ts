import { AggregateRoot } from '@nestjs/cqrs';
import { Money } from '../../shared/domain/money';
import { InsufficientFundsError, InvalidAmountError } from '../../shared/domain/domain-error';
import {
  AccountOpened,
  MoneyDeposited,
  MoneyWithdrawn,
  TransferMetadata,
} from './events/account.events';

/**
 * AccountAggregate — an EVENT-SOURCED aggregate.
 *
 * Compare this to Stage 1's Account. There, `withdraw()` did `this.balance =
 * this.balance.subtract(...)` — it changed state directly. Here, NOTHING mutates
 * state directly. Instead there are two kinds of methods, and the separation is
 * the entire trick:
 *
 *   1. COMMAND methods (open/deposit/withdraw): validate the business rules,
 *      then `apply()` an event. They decide WHETHER something is allowed.
 *
 *   2. `on<Event>` APPLY methods: the ONLY place state changes. They take an
 *      event as a given fact and mutate fields. They ask no questions — the
 *      event already happened, so they just fold it into state.
 *
 * `apply()` (from NestJS's AggregateRoot) does two things: it records the event
 * as "uncommitted" (to be saved + published later) AND it immediately calls the
 * matching `on<Event>` method so the in-memory state stays current.
 *
 * Replay falls out for free: to rebuild an account from history, we feed its
 * past events through the SAME `on<Event>` methods via `loadFromHistory()`. The
 * validation in the command methods is skipped on replay — those rules were
 * already checked when the event was first created. History is never re-judged.
 */
export class AccountAggregate extends AggregateRoot {
  private accountId!: string;
  private owner!: string;
  private balance: Money = Money.zero();

  /**
   * The aggregate's version = how many events have shaped it. It's bumped by
   * every apply method (both live and during replay), so it always equals the
   * number of events applied. The repository uses it for optimistic concurrency.
   */
  public version = 0;

  get id(): string {
    return this.accountId;
  }

  getBalance(): Money {
    return this.balance;
  }

  // ─────────────────────────── command methods ───────────────────────────
  // These enforce invariants, then emit an event. They never touch fields.

  static open(id: string, owner: string, openingBalance: Money): AccountAggregate {
    if (openingBalance.isNegative()) {
      throw new InvalidAmountError();
    }
    const account = new AccountAggregate();
    account.apply(
      new AccountOpened(id, owner, openingBalance.toMinor(), new Date().toISOString()),
    );
    return account;
  }

  deposit(amount: Money, transfer?: TransferMetadata): void {
    if (amount.isZeroOrLess()) {
      throw new InvalidAmountError();
    }
    this.apply(
      new MoneyDeposited(this.accountId, amount.toMinor(), new Date().toISOString(), transfer),
    );
  }

  withdraw(amount: Money, transfer?: TransferMetadata): void {
    if (amount.isZeroOrLess()) {
      throw new InvalidAmountError();
    }
    // Invariant checked against the CURRENT replayed balance. This is why we
    // must load (replay) the aggregate before handling a command: the decision
    // depends on state derived from history.
    if (amount.isGreaterThan(this.balance)) {
      throw new InsufficientFundsError(this.accountId);
    }
    this.apply(
      new MoneyWithdrawn(this.accountId, amount.toMinor(), new Date().toISOString(), transfer),
    );
  }

  // ──────────────────────────── apply methods ────────────────────────────
  // NestJS calls `on<EventClassName>` automatically inside apply()/replay.
  // These are the ONLY mutators. No validation here — the event is fact.

  onAccountOpened(event: AccountOpened): void {
    this.accountId = event.accountId;
    this.owner = event.owner;
    this.balance = Money.fromMinor(event.openingBalanceMinor);
    this.version++;
  }

  onMoneyDeposited(event: MoneyDeposited): void {
    this.balance = this.balance.add(Money.fromMinor(event.amountMinor));
    this.version++;
  }

  onMoneyWithdrawn(event: MoneyWithdrawn): void {
    this.balance = this.balance.subtract(Money.fromMinor(event.amountMinor));
    this.version++;
  }
}
