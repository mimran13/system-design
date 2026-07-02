/**
 * Read models for the event-sourced stage.
 *
 * These are 100% DISPOSABLE. Unlike Stage 1 — where the read model was the only
 * denormalised copy — here the event store is the source of truth, so we can
 * throw these away and rebuild them from the event log at any time (see
 * ProjectionRebuilder). That unlocks a superpower: invent a brand-new read model
 * next year and back-fill it from day-one history, as if it had always existed.
 */
export interface AccountView {
  accountId: string;
  owner: string;
  balance: number; // major units
  version: number; // how many events shaped this account
  lastActivityAt: string;
}

export interface LedgerEntry {
  accountId: string;
  type: 'OPEN' | 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  balanceAfter: number;
  transferId: string | null;
  at: string;
}
