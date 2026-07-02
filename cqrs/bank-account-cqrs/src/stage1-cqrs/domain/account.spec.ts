import { Account } from './account';
import { Money } from '../../shared/domain/money';
import { InsufficientFundsError, InvalidAmountError } from '../../shared/domain/domain-error';

/**
 * Notice these tests need NO NestJS, no database, no mocks. The write model is a
 * plain object with the rules baked in, so its behaviour is testable in
 * isolation at nanosecond speed. Rich domain models are a joy to test — that's
 * one of the quieter payoffs of keeping logic in the model instead of handlers.
 */
describe('Account (Stage 1 write model)', () => {
  const open = (openingMajor: number) =>
    Account.open('acc-1', 'Ada', Money.fromMajor(openingMajor));

  it('applies deposits and withdrawals to the balance', () => {
    const account = open(100);
    account.deposit(Money.fromMajor(50));
    account.withdraw(Money.fromMajor(30));
    expect(account.getBalance().toMajor()).toBe(120);
  });

  it('enforces the no-overdraft invariant', () => {
    const account = open(40);
    expect(() => account.withdraw(Money.fromMajor(50))).toThrow(InsufficientFundsError);
    // ...and the failed withdrawal left the balance untouched.
    expect(account.getBalance().toMajor()).toBe(40);
  });

  it('rejects non-positive amounts', () => {
    const account = open(10);
    expect(() => account.deposit(Money.fromMajor(0))).toThrow(InvalidAmountError);
    expect(() => account.withdraw(Money.fromMinor(-5))).toThrow(InvalidAmountError);
  });
});
