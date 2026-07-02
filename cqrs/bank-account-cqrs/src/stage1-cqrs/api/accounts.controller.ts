import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { v4 as uuid } from 'uuid';
import { OpenAccountDto, AmountDto } from './dto';
import { OpenAccountCommand } from '../commands/open-account.command';
import { DepositCommand } from '../commands/deposit.command';
import { WithdrawCommand } from '../commands/withdraw.command';
import { GetAccountQuery } from '../queries/get-account.query';
import { ListTransactionsQuery } from '../queries/list-transactions.query';

/**
 * The controller is the thinnest possible layer. Look at how little it does:
 * validate input (via the DTO), build a message, and hand it to a bus. It does
 * NOT know about repositories, the domain, or the read store. It only knows the
 * two buses.
 *
 *   - Writes go through the CommandBus  → route to the one matching command handler
 *   - Reads  go through the QueryBus    → route to the one matching query handler
 *
 * That split — different bus, different path, different model — IS command/query
 * responsibility segregation, right here at the entry point.
 */
@Controller('stage1/accounts')
export class Stage1AccountsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async open(@Body() dto: OpenAccountDto) {
    const accountId = uuid();
    // execute() returns whatever the handler returns — here, the new id.
    return this.commandBus.execute(
      new OpenAccountCommand(accountId, dto.owner, dto.openingBalanceMinor),
    );
  }

  @Post(':id/deposit')
  async deposit(@Param('id') id: string, @Body() dto: AmountDto) {
    await this.commandBus.execute(new DepositCommand(id, dto.amountMinor));
    return { ok: true };
  }

  @Post(':id/withdraw')
  async withdraw(@Param('id') id: string, @Body() dto: AmountDto) {
    await this.commandBus.execute(new WithdrawCommand(id, dto.amountMinor));
    return { ok: true };
  }

  @Get(':id')
  async getAccount(@Param('id') id: string) {
    // Straight to the QueryBus → read model. The domain is never loaded.
    return this.queryBus.execute(new GetAccountQuery(id));
  }

  @Get(':id/transactions')
  async listTransactions(@Param('id') id: string) {
    return this.queryBus.execute(new ListTransactionsQuery(id));
  }
}
