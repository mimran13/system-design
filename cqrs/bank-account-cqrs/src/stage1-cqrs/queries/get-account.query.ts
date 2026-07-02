import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ReadModelStore } from '../infrastructure/read-model.store';
import { AccountView } from '../read-model/account-view';
import { AccountNotFoundError } from '../../shared/domain/domain-error';

/**
 * A QUERY asks a question and NEVER changes state. That's the "Q" and the whole
 * segregation idea: queries take a completely different path from commands. They
 * skip the domain model entirely and read straight from the pre-computed read
 * model, so they're fast and can't accidentally trigger a business rule.
 *
 * Like commands, a query is a plain immutable message with one handler.
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
