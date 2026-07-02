import { Injectable } from '@nestjs/common';
import { EventPublisher, IEvent } from '@nestjs/cqrs';
import { AccountAggregate } from '../domain/account.aggregate';
import { EventStore, StoredEvent } from './event-store';
import { EVENT_TYPES } from '../domain/events/account.events';

/**
 * The event-sourced repository. It presents the SAME "load an aggregate / save
 * an aggregate" interface as Stage 1's repository, but the mechanics are
 * completely different — and that's the point. Callers (command handlers) don't
 * change; only what happens behind `findById`/`save` changes.
 */
@Injectable()
export class EventSourcedAccountRepository {
  constructor(
    private readonly eventStore: EventStore,
    // EventPublisher "wires up" a fresh aggregate so that when we later call
    // aggregate.commit(), its uncommitted events are published to the EventBus
    // (which is how projections and sagas get fed).
    private readonly publisher: EventPublisher,
  ) {}

  /**
   * LOAD = read the stream + replay it.
   * There is no "SELECT * FROM accounts WHERE id = ?". We fetch every event that
   * ever happened to this account and fold them, in order, back into a fresh
   * aggregate. The final in-memory state is the sum of its history.
   */
  async findById(id: string): Promise<AccountAggregate | null> {
    const stored = await this.eventStore.readStream(id);
    if (stored.length === 0) {
      return null;
    }

    const aggregate = this.publisher.mergeObjectContext(new AccountAggregate());
    // loadFromHistory replays each event through the aggregate's on<Event>
    // methods WITHOUT marking them uncommitted (they're already saved).
    aggregate.loadFromHistory(stored.map((e) => this.deserialize(e)));
    return aggregate;
  }

  /**
   * SAVE = append the new events, then publish them.
   * We never write "the new balance". We write the events the command produced.
   *
   *   expectedVersion = current version MINUS the events we just added
   *                   = the version the store should still be at.
   * If another writer slipped events in since we loaded, the store's length
   * won't match and append() throws a ConcurrencyError.
   */
  async save(aggregate: AccountAggregate): Promise<void> {
    const uncommitted = aggregate.getUncommittedEvents();
    if (uncommitted.length === 0) return;

    const expectedVersion = aggregate.version - uncommitted.length;
    await this.eventStore.append(aggregate.id, uncommitted, expectedVersion);

    // commit() flushes the uncommitted events onto the EventBus (feeding
    // projections + sagas) and clears the aggregate's uncommitted list.
    aggregate.commit();
  }

  /**
   * Rebuild the right event CLASS from a stored row. Replay relies on
   * `event.constructor.name` to find the `on<Event>` handler, so a plain object
   * won't do — we graft the payload onto the correct prototype. In a production
   * store this is your (versioned!) deserialiser, and it's where you'd handle
   * schema evolution as events change shape over the years.
   */
  private deserialize(stored: StoredEvent): IEvent {
    const ctor = (EVENT_TYPES as Record<string, new (...args: any[]) => IEvent>)[stored.type];
    if (!ctor) {
      throw new Error(`Unknown event type in stream: ${stored.type}`);
    }
    return Object.assign(Object.create(ctor.prototype), stored.payload) as IEvent;
  }
}
