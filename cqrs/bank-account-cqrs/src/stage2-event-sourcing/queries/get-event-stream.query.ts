import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EventStore, StoredEvent } from '../infrastructure/event-store';

/**
 * This query exists purely to let you SEE the source of truth: the raw,
 * append-only list of events for one account. Hit it after a few operations and
 * you're looking at the account's entire life story — the thing that makes event
 * sourcing special.
 *
 * It also gives you "time travel" for free: take the first N events and replay
 * them and you know precisely what the balance was at any past moment. A regular
 * CRUD system that only stores the current balance simply cannot answer "what
 * was the balance last Tuesday, and why did it change?" — that history was
 * overwritten. Here it never is.
 *
 * Note this handler reaches the EVENT STORE, not the read model — it's showing
 * you the write-side truth directly, which is the exception, not the rule.
 */
export class GetEventStreamQuery implements IQuery {
  constructor(public readonly accountId: string) {}
}

@QueryHandler(GetEventStreamQuery)
export class GetEventStreamHandler implements IQueryHandler<GetEventStreamQuery> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(query: GetEventStreamQuery): Promise<StoredEvent[]> {
    return this.eventStore.readStream(query.accountId);
  }
}
