import { Injectable } from '@nestjs/common';
import { AccountView, LedgerEntry } from '../read-model/account-view';

/**
 * The read store for Stage 2. Same idea as Stage 1's — denormalised views the
 * query side reads — with one extra capability: `reset()`. Because these views
 * are derived from the event log, we're allowed to wipe them and rebuild from
 * scratch. That's what the ProjectionRebuilder uses.
 */
@Injectable()
export class ReadModelStore {
  private accounts = new Map<string, AccountView>();
  private ledgers = new Map<string, LedgerEntry[]>();

  reset(): void {
    this.accounts = new Map();
    this.ledgers = new Map();
  }

  upsertAccount(view: AccountView): void {
    this.accounts.set(view.accountId, view);
  }

  getAccount(id: string): AccountView | null {
    return this.accounts.get(id) ?? null;
  }

  listAccounts(): AccountView[] {
    return [...this.accounts.values()];
  }

  appendLedger(entry: LedgerEntry): void {
    const rows = this.ledgers.get(entry.accountId) ?? [];
    rows.push(entry);
    this.ledgers.set(entry.accountId, rows);
  }

  getLedger(id: string): LedgerEntry[] {
    return this.ledgers.get(id) ?? [];
  }
}
