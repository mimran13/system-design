import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Money } from '../../shared/domain/money';
import { EventSourcedAccountRepository } from '../infrastructure/account.repository';
import { AccountNotFoundError } from '../../shared/domain/domain-error';
import { TransferMetadata } from '../domain/events/account.events';

export class DepositCommand implements ICommand {
  constructor(
    public readonly accountId: string,
    public readonly amountMinor: number,
    // Set by the transfer saga when this deposit is a transfer's second leg.
    public readonly transfer?: TransferMetadata,
  ) {}
}

@CommandHandler(DepositCommand)
export class DepositHandler implements ICommandHandler<DepositCommand> {
  constructor(private readonly repository: EventSourcedAccountRepository) {}

  async execute(command: DepositCommand): Promise<void> {
    // findById REPLAYS the account's whole event history to rebuild it.
    const account = await this.repository.findById(command.accountId);
    if (!account) {
      throw new AccountNotFoundError(command.accountId);
    }

    // The command method appends a MoneyDeposited event to the aggregate.
    account.deposit(Money.fromMinor(command.amountMinor), command.transfer);

    // save() appends that new event to the store and publishes it.
    await this.repository.save(account);
  }
}
