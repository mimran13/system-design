import { Injectable } from '@nestjs/common';
import { AccountView, TransactionView } from '../read-model/account-view';

/**
 * The READ-side store. Holds the denormalised views the query handlers serve.
 *
 * Note this is a SEPARATE store from AccountRepository. In this in-memory demo
 * they're both just Maps in the same process, but conceptually — and often
 * physically in production — the read store is a different database entirely.
 * Only the projection (an event handler) is allowed to write to it; query
 * handlers only read. That one-way flow is what keeps the two sides decoupled.
 */
@Injectable()
export class ReadModelStore {
  private readonly accounts = new Map<string, AccountView>();
  private readonly ledger = new Map<string, TransactionView[]>();

  upsertAccount(view: AccountView): void {
    this.accounts.set(view.accountId, view);
  }

  getAccount(accountId: string): AccountView | null {
    return this.accounts.get(accountId) ?? null;
  }

  listAccounts(): AccountView[] {
    return [...this.accounts.values()];
  }

  appendTransaction(tx: TransactionView): void {
    const rows = this.ledger.get(tx.accountId) ?? [];
    rows.push(tx);
    this.ledger.set(tx.accountId, rows);
  }

  getTransactions(accountId: string): TransactionView[] {
    return this.ledger.get(accountId) ?? [];
  }
}
