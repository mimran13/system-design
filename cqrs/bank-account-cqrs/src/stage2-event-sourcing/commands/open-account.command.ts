import { CommandHandler, EventPublisher, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { AccountAggregate } from '../domain/account.aggregate';
import { Money } from '../../shared/domain/money';
import { EventSourcedAccountRepository } from '../infrastructure/account.repository';

export class OpenAccountCommand implements ICommand {
  constructor(
    public readonly accountId: string,
    public readonly owner: string,
    public readonly openingBalanceMinor: number,
  ) {}
}

@CommandHandler(OpenAccountCommand)
export class OpenAccountHandler implements ICommandHandler<OpenAccountCommand> {
  constructor(
    private readonly repository: EventSourcedAccountRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: OpenAccountCommand): Promise<{ accountId: string }> {
    // For a NEW aggregate we wrap it with the publisher so that, when the
    // repository calls commit(), the AccountOpened event reaches the EventBus.
    // (Loaded aggregates get wrapped inside the repository instead.)
    const account = this.publisher.mergeObjectContext(
      AccountAggregate.open(
        command.accountId,
        command.owner,
        Money.fromMinor(command.openingBalanceMinor),
      ),
    );

    await this.repository.save(account);
    return { accountId: command.accountId };
  }
}
