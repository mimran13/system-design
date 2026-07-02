import { IEvent } from '@nestjs/cqrs';

/**
 * Domain events for Stage 1.
 *
 * IMPORTANT distinction that trips people up:
 *
 * In this pure-CQRS stage, these events are just NOTIFICATIONS. The write model
 * has already saved its state by the time we publish one. We emit them purely so
 * the read side (the projection) can update its own denormalised copy. If we
 * lost an event here, the write model would still be correct — only the read
 * model would drift. Events are a convenience, not the truth.
 *
 * In Stage 2 the very same-looking events become the SOURCE OF TRUTH: the write
 * model has no stored state at all, and losing an event would lose data. Same
 * shape, completely different role. Keep that difference in your head.
 *
 * They implement NestJS's marker interface `IEvent` so the EventBus can carry them.
 */
export class AccountOpened implements IEvent {
  constructor(
    public readonly accountId: string,
    public readonly owner: string,
    public readonly openingBalanceMinor: number,
    public readonly occurredAt: string,
  ) {}
}

export class MoneyDeposited implements IEvent {
  constructor(
    public readonly accountId: string,
    public readonly amountMinor: number,
    public readonly occurredAt: string,
  ) {}
}

export class MoneyWithdrawn implements IEvent {
  constructor(
    public readonly accountId: string,
    public readonly amountMinor: number,
    public readonly occurredAt: string,
  ) {}
}
