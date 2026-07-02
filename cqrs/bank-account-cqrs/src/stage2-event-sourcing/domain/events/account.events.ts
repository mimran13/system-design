import { IEvent } from '@nestjs/cqrs';

/**
 * DOMAIN EVENTS — in Stage 2 these ARE the source of truth.
 *
 * This is the mental leap of event sourcing. We do NOT store "balance = 150".
 * We store the immutable list of facts that happened:
 *
 *     AccountOpened(balance 100) → MoneyDeposited(80) → MoneyWithdrawn(30)
 *
 * The balance (150) is DERIVED by replaying those facts. The event log is the
 * database of record; every other representation (the balance, the read model)
 * is a disposable projection you can rebuild at any time by replaying.
 *
 * Rules of good events:
 *   - Named in the PAST TENSE. They record what already happened; they cannot
 *     be rejected (unlike commands). AccountOpened, not OpenAccount.
 *   - IMMUTABLE. A fact never changes. To "undo", you append a new
 *     compensating event — you never edit or delete history.
 *   - Self-contained. Everything needed to replay is in the payload, because
 *     years from now this event may be replayed by code that's changed a lot.
 *
 * `TransferMetadata` is how one leg of a money transfer knows it belongs to a
 * bigger business transaction — the saga keys off it to drive the second leg.
 */
export interface TransferMetadata {
  transferId: string;
  fromAccountId: string;
  toAccountId: string;
}

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
    // Present only when this deposit is the second leg of a transfer.
    public readonly transfer?: TransferMetadata,
  ) {}
}

export class MoneyWithdrawn implements IEvent {
  constructor(
    public readonly accountId: string,
    public readonly amountMinor: number,
    public readonly occurredAt: string,
    // Present only when this withdrawal is the first leg of a transfer.
    public readonly transfer?: TransferMetadata,
  ) {}
}

/**
 * A registry so the event store can turn a persisted `{ type, payload }` row back
 * into a real event instance. Replay depends on `event.constructor.name`
 * matching the aggregate's `on<EventName>` handler, so we must rebuild the
 * correct class — a plain JSON object won't do.
 */
export const EVENT_TYPES = {
  AccountOpened,
  MoneyDeposited,
  MoneyWithdrawn,
} as const;

export type DomainEvent = AccountOpened | MoneyDeposited | MoneyWithdrawn;
