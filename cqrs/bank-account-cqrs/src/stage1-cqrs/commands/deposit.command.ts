import { CommandHandler, EventBus, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Money } from '../../shared/domain/money';
import { AccountRepository } from '../infrastructure/account.repository';
import { AccountNotFoundError } from '../../shared/domain/domain-error';
import { MoneyDeposited } from '../domain/account.events';

export class DepositCommand implements ICommand {
  constructor(
    public readonly accountId: string,
    public readonly amountMinor: number,
  ) {}
}

@CommandHandler(DepositCommand)
export class DepositHandler implements ICommandHandler<DepositCommand> {
  constructor(
    private readonly repository: AccountRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DepositCommand): Promise<void> {
    const account = await this.repository.findById(command.accountId);
    if (!account) {
      throw new AccountNotFoundError(command.accountId);
    }

    // The model validates the amount; the handler just relays the request.
    account.deposit(Money.fromMinor(command.amountMinor));
    await this.repository.save(account);

    this.eventBus.publish(
      new MoneyDeposited(command.accountId, command.amountMinor, new Date().toISOString()),
    );
  }
}
