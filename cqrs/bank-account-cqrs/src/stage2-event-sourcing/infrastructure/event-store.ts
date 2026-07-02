import { Injectable } from '@nestjs/common';
import { IEvent } from '@nestjs/cqrs';
import { ConcurrencyError } from '../../shared/domain/domain-error';

/**
 * A StoredEvent is the on-disk shape: not the rich event object, but the
 * serialisable record we'd write to a real event store (a Postgres `events`
 * table, EventStoreDB, DynamoDB, Kafka...). Note what we keep:
 *   - streamId  : which aggregate this belongs to (one stream per account)
 *   - sequence  : the event's position WITHIN its stream (0,1,2...) → concurrency
 *   - position  : the event's position in the GLOBAL log → projections read this
 *   - type      : the class name, so we can deserialise back to the right event
 *   - payload   : the event's data as plain JSON
 */
export interface StoredEvent {
  streamId: string;
  sequence: number;
  position: number;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

/**
 * The append-only log. Two hard guarantees make event sourcing trustworthy:
 *   1. APPEND-ONLY: you can add events, never mutate or delete them. History is
 *      immutable, which is exactly what gives you a perfect audit trail.
 *   2. OPTIMISTIC CONCURRENCY: append() takes the version you EXPECTED the
 *      stream to be at. If someone else wrote in the meantime, the actual length
 *      won't match and we reject — no lost updates, no row locks needed.
 *
 * Abstract on purpose: swapping the in-memory version for a real store means
 * writing one subclass and changing one line in es.module.ts.
 */
export abstract class EventStore {
  abstract append(streamId: string, events: IEvent[], expectedVersion: number): Promise<void>;
  abstract readStream(streamId: string): Promise<StoredEvent[]>;
  abstract readAll(): Promise<StoredEvent[]>;
}

@Injectable()
export class InMemoryEventStore extends EventStore {
  private readonly streams = new Map<string, StoredEvent[]>();
  private readonly all: StoredEvent[] = []; // the global log, in commit order
  private globalPosition = 0;

  async append(streamId: string, events: IEvent[], expectedVersion: number): Promise<void> {
    const stream = this.streams.get(streamId) ?? [];

    // The concurrency check: is the stream exactly where the writer left it?
    if (stream.length !== expectedVersion) {
      throw new ConcurrencyError(streamId, expectedVersion, stream.length);
    }

    for (const event of events) {
      const stored: StoredEvent = {
        streamId,
        sequence: stream.length,
        position: this.globalPosition++,
        type: event.constructor.name,
        // Shallow copy strips the class, leaving plain serialisable data —
        // exactly what JSON.stringify would produce before a DB write.
        payload: { ...(event as object) } as Record<string, unknown>,
        occurredAt: (event as { occurredAt?: string }).occurredAt ?? new Date().toISOString(),
      };
      stream.push(stored);
      this.all.push(stored);
    }

    this.streams.set(streamId, stream);
  }

  async readStream(streamId: string): Promise<StoredEvent[]> {
    return [...(this.streams.get(streamId) ?? [])];
  }

  async readAll(): Promise<StoredEvent[]> {
    return [...this.all];
  }
}
