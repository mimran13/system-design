import { Module } from '@nestjs/common';
import { CqrsBankingModule } from './stage1-cqrs/cqrs.module';
import { EventSourcingModule } from './stage2-event-sourcing/es.module';

/**
 * The root module just mounts the two lessons side by side so you can poke
 * both from the same running server and compare them:
 *
 *   Stage 1 — pure CQRS               → routes under /stage1
 *   Stage 2 — CQRS + Event Sourcing   → routes under /stage2
 *
 * They share the Money value object and the domain errors from src/shared,
 * but each stage has its OWN CqrsModule wiring, aggregate, and read model so
 * you can read either one top-to-bottom without cross-references.
 */
@Module({
  imports: [CqrsBankingModule, EventSourcingModule],
})
export class AppModule {}
