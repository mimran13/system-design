import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ReadModelStore } from '../infrastructure/read-model.store';
import { LedgerEntry } from '../read-model/account-view';

export class ListLedgerQuery implements IQuery {
  constructor(public readonly accountId: string) {}
}

@QueryHandler(ListLedgerQuery)
export class ListLedgerHandler implements IQueryHandler<ListLedgerQuery> {
  constructor(private readonly store: ReadModelStore) {}

  async execute(query: ListLedgerQuery): Promise<LedgerEntry[]> {
    return this.store.getLedger(query.accountId);
  }
}
