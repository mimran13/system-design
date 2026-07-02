import { Injectable } from '@nestjs/common';
import { EventStore, StoredEvent } from '../infrastructure/event-store';
import { ReadModelStore } from '../infrastructure/read-model.store';
import { AccountProjector } from './account.projection';
import { EVENT_TYPES, DomainEvent } from '../domain/events/account.events';

/**
 * ProjectionRebuilder — the party trick of event sourcing.
 *
 * It wipes the read model and rebuilds it from scratch by replaying EVERY event
 * in the store, in global order, through the same projector the live handlers
 * use. Because the event log is the source of truth and events are immutable,
 * the rebuilt read model is guaranteed identical to what you'd get by replaying
 * production history.
 *
 * Why you'd actually do this:
 *   - You found a bug in a projection → fix the code, rebuild, the bug is erased
 *     from the read model as if it never happened.
 *   - You want a NEW read model (a new report, a new index) → write the projector
 *     and back-fill it from all history, no data migration required.
 *   - Your read store got corrupted or lost → rebuild it; the truth was never
 *     in there anyway.
 *
 * Try it: hit POST /stage2/admin/rebuild-projections and watch the balances come
 * back out of thin air (well — out of the event log).
 */
@Injectable()
export class ProjectionRebuilder {
  constructor(
    private readonly eventStore: EventStore,
    private readonly readModel: ReadModelStore,
    private readonly projector: AccountProjector,
  ) {}

  async rebuild(): Promise<{ eventsReplayed: number }> {
    this.readModel.reset();

    const events = await this.eventStore.readAll(); // global order
    for (const stored of events) {
      this.projector.project(this.deserialize(stored));
    }

    return { eventsReplayed: events.length };
  }

  private deserialize(stored: StoredEvent): DomainEvent {
    const ctor = (EVENT_TYPES as Record<string, new (...args: any[]) => DomainEvent>)[stored.type];
    return Object.assign(Object.create(ctor.prototype), stored.payload) as DomainEvent;
  }
}
