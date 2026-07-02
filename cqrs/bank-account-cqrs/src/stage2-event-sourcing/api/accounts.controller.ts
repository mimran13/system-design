import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { v4 as uuid } from 'uuid';
import { OpenAccountDto, AmountDto, TransferDto } from './dto';
import { OpenAccountCommand } from '../commands/open-account.command';
import { DepositCommand } from '../commands/deposit.command';
import { WithdrawCommand } from '../commands/withdraw.command';
import { TransferCommand } from '../commands/transfer.command';
import { GetAccountQuery } from '../queries/get-account.query';
import { ListLedgerQuery } from '../queries/list-ledger.query';
import { GetEventStreamQuery } from '../queries/get-event-stream.query';

/**
 * Same controller shape as Stage 1 — commands on the CommandBus, queries on the
 * QueryBus. That's deliberate: the entire event-sourcing machine is hidden
 * behind the buses. From the outside, this API looks identical to a CRUD one;
 * only /events gives the game away by exposing the raw log.
 */
@Controller('stage2/accounts')
export class Stage2AccountsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async open(@Body() dto: OpenAccountDto) {
    const accountId = uuid();
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

  /** Kicks off a transfer: withdraws leg 1 here, the saga deposits leg 2. */
  @Post('transfer')
  async transfer(@Body() dto: TransferDto) {
    const transferId = uuid();
    return this.commandBus.execute(
      new TransferCommand(transferId, dto.fromAccountId, dto.toAccountId, dto.amountMinor),
    );
  }

  @Get(':id')
  async getAccount(@Param('id') id: string) {
    return this.queryBus.execute(new GetAccountQuery(id));
  }

  @Get(':id/ledger')
  async ledger(@Param('id') id: string) {
    return this.queryBus.execute(new ListLedgerQuery(id));
  }

  /** The raw event stream — the source of truth for this account. */
  @Get(':id/events')
  async events(@Param('id') id: string) {
    return this.queryBus.execute(new GetEventStreamQuery(id));
  }
}
