/**
 * The READ MODEL — shapes built purely for querying and display.
 *
 * These are deliberately DIFFERENT from the write model:
 *   - AccountView carries a human-friendly `balance` in major units and a
 *     denormalised `transactionCount` — data the write model never stores.
 *   - TransactionView is a flat ledger row, ideal for "show me my statement".
 *
 * This is the heart of CQRS: the write side is modelled for enforcing rules,
 * the read side is modelled for answering questions. They're allowed to look
 * nothing alike, because they solve different problems. In a real system the
 * read model might live in a totally different store (Elasticsearch, a
 * materialised view, a cache) optimised for reads.
 */
export interface AccountView {
  accountId: string;
  owner: string;
  balance: number; // major units, ready to display
  transactionCount: number;
  lastActivityAt: string;
}

export interface TransactionView {
  accountId: string;
  type: 'OPEN' | 'DEPOSIT' | 'WITHDRAWAL';
  amount: number; // major units
  balanceAfter: number | null;
  at: string;
}
