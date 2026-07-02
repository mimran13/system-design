import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ReadModelStore } from '../infrastructure/read-model.store';
import { AccountView } from '../read-model/account-view';
import { AccountNotFoundError } from '../../shared/domain/domain-error';

/**
 * Reads never replay events. They hit the pre-built read model, exactly like
 * Stage 1. Replaying is only for the WRITE side (to make a decision); the read
 * side stays fast by serving projections. This is why CQRS and ES fit together
 * so naturally: ES makes writes an event log, and CQRS gives reads their own
 * optimised model so they don't pay the replay cost.
 */
export class GetAccountQuery implements IQuery {
  constructor(public readonly accountId: string) {}
}

@QueryHandler(GetAccountQuery)
export class GetAccountHandler implements IQueryHandler<GetAccountQuery> {
  constructor(private readonly store: ReadModelStore) {}

  async execute(query: GetAccountQuery): Promise<AccountView> {
    const view = this.store.getAccount(query.accountId);
    if (!view) {
      throw new AccountNotFoundError(query.accountId);
    }
    return view;
  }
}
