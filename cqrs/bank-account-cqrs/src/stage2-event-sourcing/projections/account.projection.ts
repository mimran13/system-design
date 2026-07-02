import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { ReadModelStore } from '../infrastructure/read-model.store';
import { Money } from '../../shared/domain/money';
import {
  AccountOpened,
  DomainEvent,
  MoneyDeposited,
  MoneyWithdrawn,
} from '../domain/events/account.events';

/**
 * AccountProjector — the pure fold from an event to a read-model update.
 *
 * Crucially, this logic is written ONCE and used in TWO places:
 *   - live, driven by the @EventsHandler classes below as events are published;
 *   - in bulk, driven by ProjectionRebuilder replaying the entire event store.
 *
 * Same function, whether an event is one second old or from launch day. That's
 * what makes "delete the read model and rebuild it" safe and boring.
 */
@Injectable()
export class AccountProjector {
  constructor(private readonly store: ReadModelStore) {}

  project(event: DomainEvent): void {
    if (event instanceof AccountOpened) return this.onOpened(event);
    if (event instanceof MoneyDeposited) return this.onDeposited(event);
    if (event instanceof MoneyWithdrawn) return this.onWithdrawn(event);
  }

  private onOpened(event: AccountOpened): void {
    const opening = Money.fromMinor(event.openingBalanceMinor);
    this.store.upsertAccount({
      accountId: event.accountId,
      owner: event.owner,
      balance: opening.toMajor(),
      version: 1,
      lastActivityAt: event.occurredAt,
    });
    this.store.appendLedger({
      accountId: event.accountId,
      type: 'OPEN',
      amount: opening.toMajor(),
      balanceAfter: opening.toMajor(),
      transferId: null,
      at: event.occurredAt,
    });
  }

  private onDeposited(event: MoneyDeposited): void {
    const view = this.store.getAccount(event.accountId);
    if (!view) return;
    const balance = Money.fromMajor(view.balance).add(Money.fromMinor(event.amountMinor));
    this.store.upsertAccount({
      ...view,
      balance: balance.toMajor(),
      version: view.version + 1,
      lastActivityAt: event.occurredAt,
    });
    this.store.appendLedger({
      accountId: event.accountId,
      type: 'DEPOSIT',
      amount: Money.fromMinor(event.amountMinor).toMajor(),
      balanceAfter: balance.toMajor(),
      transferId: event.transfer?.transferId ?? null,
      at: event.occurredAt,
    });
  }

  private onWithdrawn(event: MoneyWithdrawn): void {
    const view = this.store.getAccount(event.accountId);
    if (!view) return;
    const balance = Money.fromMajor(view.balance).subtract(Money.fromMinor(event.amountMinor));
    this.store.upsertAccount({
      ...view,
      balance: balance.toMajor(),
      version: view.version + 1,
      lastActivityAt: event.occurredAt,
    });
    this.store.appendLedger({
      accountId: event.accountId,
      type: 'WITHDRAWAL',
      amount: Money.fromMinor(event.amountMinor).toMajor(),
      balanceAfter: balance.toMajor(),
      transferId: event.transfer?.transferId ?? null,
      at: event.occurredAt,
    });
  }
}

/*
 * The three @EventsHandler classes below are the LIVE subscription. When an
 * aggregate commits, its events hit the EventBus and land here, keeping the read
 * model current. They do nothing but delegate to the projector above.
 */

@EventsHandler(AccountOpened)
export class AccountOpenedHandler implements IEventHandler<AccountOpened> {
  constructor(private readonly projector: AccountProjector) {}
  handle(event: AccountOpened): void {
    this.projector.project(event);
  }
}

@EventsHandler(MoneyDeposited)
export class MoneyDepositedHandler implements IEventHandler<MoneyDeposited> {
  constructor(private readonly projector: AccountProjector) {}
  handle(event: MoneyDeposited): void {
    this.projector.project(event);
  }
}

@EventsHandler(MoneyWithdrawn)
export class MoneyWithdrawnHandler implements IEventHandler<MoneyWithdrawn> {
  constructor(private readonly projector: AccountProjector) {}
  handle(event: MoneyWithdrawn): void {
    this.projector.project(event);
  }
}
