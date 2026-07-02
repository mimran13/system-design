import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Money } from '../../shared/domain/money';
import { EventSourcedAccountRepository } from '../infrastructure/account.repository';
import { AccountNotFoundError } from '../../shared/domain/domain-error';

export class WithdrawCommand implements ICommand {
  constructor(
    public readonly accountId: string,
    public readonly amountMinor: number,
  ) {}
}

@CommandHandler(WithdrawCommand)
export class WithdrawHandler implements ICommandHandler<WithdrawCommand> {
  constructor(private readonly repository: EventSourcedAccountRepository) {}

  async execute(command: WithdrawCommand): Promise<void> {
    const account = await this.repository.findById(command.accountId);
    if (!account) {
      throw new AccountNotFoundError(command.accountId);
    }

    // The no-overdraft invariant is checked against the REPLAYED balance inside
    // the aggregate. If it fails, no event is appended and nothing is published.
    account.withdraw(Money.fromMinor(command.amountMinor));
    await this.repository.save(account);
  }
}
