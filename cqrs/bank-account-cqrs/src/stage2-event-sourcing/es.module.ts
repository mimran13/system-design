import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { Stage2AccountsController } from './api/accounts.controller';
import { Stage2AdminController } from './api/admin.controller';

import { OpenAccountHandler } from './commands/open-account.command';
import { DepositHandler } from './commands/deposit.command';
import { WithdrawHandler } from './commands/withdraw.command';
import { TransferHandler } from './commands/transfer.command';

import { GetAccountHandler } from './queries/get-account.query';
import { ListLedgerHandler } from './queries/list-ledger.query';
import { GetEventStreamHandler } from './queries/get-event-stream.query';

import {
  AccountProjector,
  AccountOpenedHandler,
  MoneyDepositedHandler,
  MoneyWithdrawnHandler,
} from './projections/account.projection';
import { ProjectionRebuilder } from './projections/projection-rebuilder';
import { TransferSaga } from './sagas/transfer.saga';

import { EventStore, InMemoryEventStore } from './infrastructure/event-store';
import { EventSourcedAccountRepository } from './infrastructure/account.repository';
import { ReadModelStore } from './infrastructure/read-model.store';

const CommandHandlers = [OpenAccountHandler, DepositHandler, WithdrawHandler, TransferHandler];
const QueryHandlers = [GetAccountHandler, ListLedgerHandler, GetEventStreamHandler];
const EventHandlers = [AccountOpenedHandler, MoneyDepositedHandler, MoneyWithdrawnHandler];

/**
 * Stage 2 module — CQRS + EVENT SOURCING.
 *
 * The wiring differs from Stage 1 in three telling ways:
 *
 *   - EventStore replaces the state repository as the source of truth
 *     ({ provide: EventStore, useClass: InMemoryEventStore } — the swap seam).
 *   - EventSourcedAccountRepository loads aggregates by REPLAYING that store.
 *   - TransferSaga is registered as a provider so @nestjs/cqrs discovers its
 *     @Saga and starts pumping its output commands through the CommandBus.
 *
 * Everything else — CommandBus, QueryBus, EventBus, the decorator-driven handler
 * registration — is the same CqrsModule machinery you met in Stage 1.
 */
@Module({
  imports: [CqrsModule],
  controllers: [Stage2AccountsController, Stage2AdminController],
  providers: [
    { provide: EventStore, useClass: InMemoryEventStore },
    EventSourcedAccountRepository,
    ReadModelStore,
    AccountProjector,
    ProjectionRebuilder,
    TransferSaga,
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
  ],
})
export class EventSourcingModule {}
