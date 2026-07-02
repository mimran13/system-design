import { AccountAggregate } from './account.aggregate';
import { Money } from '../../shared/domain/money';
import { AccountOpened, MoneyDeposited, MoneyWithdrawn } from './events/account.events';
import { InsufficientFundsError } from '../../shared/domain/domain-error';

/**
 * These tests show the two behaviours that define an event-sourced aggregate:
 *   1. Commands PRODUCE events (getUncommittedEvents) rather than mutating rows.
 *   2. State is REBUILT by replaying events (loadFromHistory) — and replaying the
 *      events a command produced yields the exact same state.
 */
describe('AccountAggregate (Stage 2, event-sourced)', () => {
  it('emits events instead of mutating stored state', () => {
    const account = AccountAggregate.open('acc-1', 'Ada', Money.fromMajor(100));
    account.deposit(Money.fromMajor(50));
    account.withdraw(Money.fromMajor(30));

    const events = account.getUncommittedEvents();
    expect(events.map((e) => e.constructor.name)).toEqual([
      'AccountOpened',
      'MoneyDeposited',
      'MoneyWithdrawn',
    ]);
    expect(account.getBalance().toMajor()).toBe(120);
    // version tracks the number of events applied.
    expect(account.version).toBe(3);
  });

  it('rebuilds identical state by replaying history', () => {
    const history = [
      new AccountOpened('acc-1', 'Ada', 10000, '2026-01-01T00:00:00.000Z'),
      new MoneyDeposited('acc-1', 5000, '2026-01-02T00:00:00.000Z'),
      new MoneyWithdrawn('acc-1', 3000, '2026-01-03T00:00:00.000Z'),
    ];

    const rebuilt = new AccountAggregate();
    rebuilt.loadFromHistory(history);

    expect(rebuilt.getBalance().toMajor()).toBe(120);
    expect(rebuilt.version).toBe(3);
    // Replaying history must NOT re-queue those events as new/uncommitted.
    expect(rebuilt.getUncommittedEvents()).toHaveLength(0);
  });

  it('still enforces invariants against the replayed balance', () => {
    const rebuilt = new AccountAggregate();
    rebuilt.loadFromHistory([new AccountOpened('acc-1', 'Ada', 4000, '2026-01-01T00:00:00.000Z')]);

    expect(() => rebuilt.withdraw(Money.fromMajor(50))).toThrow(InsufficientFundsError);
  });
});
