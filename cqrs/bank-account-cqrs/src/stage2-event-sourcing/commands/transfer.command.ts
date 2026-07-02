import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Money } from '../../shared/domain/money';
import { EventSourcedAccountRepository } from '../infrastructure/account.repository';
import { AccountNotFoundError } from '../../shared/domain/domain-error';

/**
 * Transfer is interesting because it spans TWO aggregates. A core DDD rule:
 * one command mutates ONE aggregate (that's the consistency boundary). So we do
 * NOT withdraw-and-deposit in a single handler. Instead:
 *
 *   1. This handler withdraws from the source only, tagging the MoneyWithdrawn
 *      event with transfer metadata.
 *   2. A SAGA (see sagas/transfer.saga.ts) reacts to that event and fires a
 *      DepositCommand at the destination — the second leg, its own transaction.
 *
 * That's the saga / process-manager pattern: a long-running business process
 * stitched together from single-aggregate steps, coordinated by events.
 */
export class TransferCommand implements ICommand {
  constructor(
    public readonly transferId: string,
    public readonly fromAccountId: string,
    public readonly toAccountId: string,
    public readonly amountMinor: number,
  ) {}
}

@CommandHandler(TransferCommand)
export class TransferHandler implements ICommandHandler<TransferCommand> {
  constructor(private readonly repository: EventSourcedAccountRepository) {}

  async execute(command: TransferCommand): Promise<{ transferId: string }> {
    const source = await this.repository.findById(command.fromAccountId);
    if (!source) {
      throw new AccountNotFoundError(command.fromAccountId);
    }
    // Check the destination exists BEFORE we move any money, to shrink the
    // window where the second leg could fail. (It's still not atomic across the
    // two accounts — see the saga for how compensation would handle failure.)
    const destination = await this.repository.findById(command.toAccountId);
    if (!destination) {
      throw new AccountNotFoundError(command.toAccountId);
    }

    // Leg 1: withdraw from source, stamped with transfer metadata so the saga
    // knows this withdrawal should trigger a matching deposit.
    source.withdraw(Money.fromMinor(command.amountMinor), {
      transferId: command.transferId,
      fromAccountId: command.fromAccountId,
      toAccountId: command.toAccountId,
    });
    await this.repository.save(source);

    return { transferId: command.transferId };
  }
}
