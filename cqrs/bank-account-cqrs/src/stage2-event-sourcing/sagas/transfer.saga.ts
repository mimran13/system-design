import { Injectable } from '@nestjs/common';
import { ICommand, Saga, ofType } from '@nestjs/cqrs';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { MoneyWithdrawn } from '../domain/events/account.events';
import { DepositCommand } from '../commands/deposit.command';

/**
 * TransferSaga — a process manager that turns events into follow-up commands.
 *
 * In @nestjs/cqrs a saga is a method decorated with @Saga that receives a STREAM
 * of every event on the EventBus (an RxJS Observable) and returns a stream of
 * COMMANDS to dispatch. The framework subscribes to it and pumps the returned
 * commands through the CommandBus for you.
 *
 * The flow this implements:
 *
 *     TransferCommand → [source] MoneyWithdrawn (with transfer metadata)
 *                              │
 *                     TransferSaga sees it
 *                              ▼
 *                        DepositCommand → [destination] MoneyDeposited
 *
 * Read it as: "whenever money is withdrawn AS PART OF a transfer, deposit the
 * same amount into the destination account." The two legs are separate
 * transactions on separate aggregates, glued together by this rule.
 *
 * Note the shape of the reactive pipeline:
 *   ofType(MoneyWithdrawn) — only care about withdrawals
 *   filter(has transfer)   — ...that are the first leg of a transfer
 *   map(→ DepositCommand)  — turn each into the second-leg command
 *
 * REAL-WORLD CAVEAT (kept honest): this is the happy path. If the DepositCommand
 * failed (say the destination were closed), the money would have left the source
 * with nowhere to land. A production saga also listens for failure and emits a
 * COMPENSATING command — here, deposit the amount back into the source to undo
 * leg 1. That's "eventual consistency with compensation", the distributed-systems
 * substitute for a single ACID transaction you can't have across aggregates.
 */
@Injectable()
export class TransferSaga {
  @Saga()
  moneyTransferred = (events$: Observable<any>): Observable<ICommand> => {
    return events$.pipe(
      ofType(MoneyWithdrawn),
      filter((event) => !!event.transfer),
      map(
        (event) =>
          new DepositCommand(event.transfer!.toAccountId, event.amountMinor, event.transfer),
      ),
    );
  };
}
