import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { ReadModelStore } from '../infrastructure/read-model.store';
import { AccountOpened, MoneyDeposited, MoneyWithdrawn } from '../domain/account.events';
import { Money } from '../../shared/domain/money';

/**
 * The PROJECTION. It listens for domain events and updates the read model.
 *
 * This is the bridge between the two sides of CQRS. Commands change the write
 * model and emit events; this handler turns those events into the denormalised
 * shapes the query side serves. It is the ONLY writer to ReadModelStore.
 *
 * @nestjs/cqrs lets ONE class handle MANY event types — each `handle` method is
 * matched to the event named in its @EventsHandler(...) decorator. Here we split
 * into three tiny handler classes for clarity; grouping them is also fine.
 *
 * A word on timing: in this in-memory demo the EventBus dispatches synchronously,
 * so the read model updates before the HTTP response returns. In production the
 * projection is often asynchronous (events flow through Kafka/a queue), which
 * means the read model is EVENTUALLY consistent — it lags the write model by
 * milliseconds. Designing for that lag is the tax you pay for CQRS's benefits.
 */
@EventsHandler(AccountOpened)
export class AccountOpenedProjection implements IEventHandler<AccountOpened> {
  constructor(private readonly store: ReadModelStore) {}

  handle(event: AccountOpened): void {
    const balance = Money.fromMinor(event.openingBalanceMinor);
    this.store.upsertAccount({
      accountId: event.accountId,
      owner: event.owner,
      balance: balance.toMajor(),
      transactionCount: 1,
      lastActivityAt: event.occurredAt,
    });
    this.store.appendTransaction({
      accountId: event.accountId,
      type: 'OPEN',
      amount: balance.toMajor(),
      balanceAfter: balance.toMajor(),
      at: event.occurredAt,
    });
  }
}

@EventsHandler(MoneyDeposited)
export class MoneyDepositedProjection implements IEventHandler<MoneyDeposited> {
  constructor(private readonly store: ReadModelStore) {}

  handle(event: MoneyDeposited): void {
    const view = this.store.getAccount(event.accountId);
    if (!view) return; // out-of-order event; a real projector would park/retry it
    const newBalance = Money.fromMajor(view.balance).add(Money.fromMinor(event.amountMinor));
    this.store.upsertAccount({
      ...view,
      balance: newBalance.toMajor(),
      transactionCount: view.transactionCount + 1,
      lastActivityAt: event.occurredAt,
    });
    this.store.appendTransaction({
      accountId: event.accountId,
      type: 'DEPOSIT',
      amount: Money.fromMinor(event.amountMinor).toMajor(),
      balanceAfter: newBalance.toMajor(),
      at: event.occurredAt,
    });
  }
}

@EventsHandler(MoneyWithdrawn)
export class MoneyWithdrawnProjection implements IEventHandler<MoneyWithdrawn> {
  constructor(private readonly store: ReadModelStore) {}

  handle(event: MoneyWithdrawn): void {
    const view = this.store.getAccount(event.accountId);
    if (!view) return;
    const newBalance = Money.fromMajor(view.balance).subtract(Money.fromMinor(event.amountMinor));
    this.store.upsertAccount({
      ...view,
      balance: newBalance.toMajor(),
      transactionCount: view.transactionCount + 1,
      lastActivityAt: event.occurredAt,
    });
    this.store.appendTransaction({
      accountId: event.accountId,
      type: 'WITHDRAWAL',
      amount: Money.fromMinor(event.amountMinor).toMajor(),
      balanceAfter: newBalance.toMajor(),
      at: event.occurredAt,
    });
  }
}
