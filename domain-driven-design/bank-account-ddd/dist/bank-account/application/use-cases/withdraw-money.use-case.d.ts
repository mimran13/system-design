import { EventEmitter2 } from '@nestjs/event-emitter';
import { IBankAccountRepository } from '../../domain/repositories/bank-account.repository.interface';
import { ITransactionRepository } from '../../domain/repositories/transaction.repository.interface';
export interface WithdrawMoneyCommand {
    accountId: string;
    amount: number;
    currency: string;
    description: string;
}
export interface WithdrawMoneyResult {
    transactionId: string;
    newBalance: number;
    currency: string;
}
export declare class WithdrawMoneyUseCase {
    private readonly accountRepo;
    private readonly transactionRepo;
    private readonly eventEmitter;
    constructor(accountRepo: IBankAccountRepository, transactionRepo: ITransactionRepository, eventEmitter: EventEmitter2);
    execute(command: WithdrawMoneyCommand): Promise<WithdrawMoneyResult>;
    private tryWithdraw;
}
