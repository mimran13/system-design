import { CommandHandler, EventBus, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Account } from '../domain/account';
import { Money } from '../../shared/domain/money';
import { AccountRepository } from '../infrastructure/account.repository';
import { AccountOpened } from '../domain/account.events';

/**
 * A COMMAND is an imperative message: "do this thing." It is named in the
 * imperative mood (OpenAccount, not AccountOpened) and it expresses INTENT —
 * it may be rejected. Commands are the ONLY way to change state in CQRS.
 *
 * A command is a plain, immutable data object. No logic. It just names the
 * operation and carries its inputs.
 */
export class OpenAccountCommand implements ICommand {
  constructor(
    public readonly accountId: string,
    public readonly owner: string,
    public readonly openingBalanceMinor: number,
  ) {}
}

/**
 * A COMMAND HANDLER is where the intent meets the domain. Exactly ONE handler
 * exists per command type — that's a rule the CommandBus enforces. The handler:
 *   1. loads (or creates) the write model,
 *   2. asks the model to perform the operation (the model enforces the rules),
 *   3. persists the model,
 *   4. announces what happened via an event so the read side can catch up.
 *
 * The handler orchestrates; it does NOT contain business rules. "No overdraft"
 * lives in Account, not here. Handlers stay thin on purpose.
 */
@CommandHandler(OpenAccountCommand)
export class OpenAccountHandler implements ICommandHandler<OpenAccountCommand> {
  constructor(
    private readonly repository: AccountRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: OpenAccountCommand): Promise<{ accountId: string }> {
    const account = Account.open(
      command.accountId,
      command.owner,
      Money.fromMinor(command.openingBalanceMinor),
    );

    await this.repository.save(account);

    this.eventBus.publish(
      new AccountOpened(
        command.accountId,
        command.owner,
        command.openingBalanceMinor,
        new Date().toISOString(),
      ),
    );

    return { accountId: command.accountId };
  }
}
