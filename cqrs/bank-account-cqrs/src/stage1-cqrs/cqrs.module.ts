import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { Stage1AccountsController } from './api/accounts.controller';
import { OpenAccountHandler } from './commands/open-account.command';
import { DepositHandler } from './commands/deposit.command';
import { WithdrawHandler } from './commands/withdraw.command';
import { GetAccountHandler } from './queries/get-account.query';
import { ListTransactionsHandler } from './queries/list-transactions.query';
import {
  AccountOpenedProjection,
  MoneyDepositedProjection,
  MoneyWithdrawnProjection,
} from './read-model/account.projection';
import { AccountRepository, InMemoryAccountRepository } from './infrastructure/account.repository';
import { ReadModelStore } from './infrastructure/read-model.store';

const CommandHandlers = [OpenAccountHandler, DepositHandler, WithdrawHandler];
const QueryHandlers = [GetAccountHandler, ListTransactionsHandler];
const Projections = [
  AccountOpenedProjection,
  MoneyDepositedProjection,
  MoneyWithdrawnProjection,
];

/**
 * Stage 1 module — PURE CQRS.
 *
 * `CqrsModule` gives us the CommandBus, QueryBus and EventBus. NestJS wires each
 * handler to its message type automatically from the @CommandHandler /
 * @QueryHandler / @EventsHandler decorators — you just have to list the classes
 * as providers so they get instantiated and registered.
 *
 * The one line worth staring at:
 *
 *     { provide: AccountRepository, useClass: InMemoryAccountRepository }
 *
 * Every handler injects the ABSTRACT `AccountRepository`. This binding decides
 * the concrete implementation. Swap `InMemoryAccountRepository` for a
 * `PostgresAccountRepository` here and nothing else in the module changes. That
 * is the dependency-inversion seam that keeps the domain free of infrastructure.
 */
@Module({
  imports: [CqrsModule],
  controllers: [Stage1AccountsController],
  providers: [
    { provide: AccountRepository, useClass: InMemoryAccountRepository },
    ReadModelStore,
    ...CommandHandlers,
    ...QueryHandlers,
    ...Projections,
  ],
})
export class CqrsBankingModule {}
