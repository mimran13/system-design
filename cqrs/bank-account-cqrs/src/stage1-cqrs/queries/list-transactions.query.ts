import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ReadModelStore } from '../infrastructure/read-model.store';
import { TransactionView } from '../read-model/account-view';

/**
 * "Show me the statement." A perfect example of why CQRS earns its keep: this
 * ledger view is a shape the write model doesn't even store. The read model was
 * built specifically to answer this question quickly, so the query is a trivial
 * lookup instead of an expensive join or recomputation.
 */
export class ListTransactionsQuery implements IQuery {
  constructor(public readonly accountId: string) {}
}

@QueryHandler(ListTransactionsQuery)
export class ListTransactionsHandler implements IQueryHandler<ListTransactionsQuery> {
  constructor(private readonly store: ReadModelStore) {}

  async execute(query: ListTransactionsQuery): Promise<TransactionView[]> {
    return this.store.getTransactions(query.accountId);
  }
}
