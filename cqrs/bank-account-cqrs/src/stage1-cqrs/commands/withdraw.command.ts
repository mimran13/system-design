import { CommandHandler, EventBus, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Money } from '../../shared/domain/money';
import { AccountRepository } from '../infrastructure/account.repository';
import { AccountNotFoundError } from '../../shared/domain/domain-error';
import { MoneyWithdrawn } from '../domain/account.events';

export class WithdrawCommand implements ICommand {
  constructor(
    public readonly accountId: string,
    public readonly amountMinor: number,
  ) {}
}

@CommandHandler(WithdrawCommand)
export class WithdrawHandler implements ICommandHandler<WithdrawCommand> {
  constructor(
    private readonly repository: AccountRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: WithdrawCommand): Promise<void> {
    const account = await this.repository.findById(command.accountId);
    if (!account) {
      throw new AccountNotFoundError(command.accountId);
    }

    // If this breaks the no-overdraft invariant, the model throws and we never
    // save or publish anything. The command is rejected cleanly.
    account.withdraw(Money.fromMinor(command.amountMinor));
    await this.repository.save(account);

    this.eventBus.publish(
      new MoneyWithdrawn(command.accountId, command.amountMinor, new Date().toISOString()),
    );
  }
}
