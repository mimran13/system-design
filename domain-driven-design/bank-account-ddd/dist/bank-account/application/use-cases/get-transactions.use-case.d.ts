import { IBankAccountRepository } from '../../domain/repositories/bank-account.repository.interface';
import { ITransactionRepository } from '../../domain/repositories/transaction.repository.interface';
export interface GetTransactionsQuery {
    accountId: string;
    limit?: number;
    offset?: number;
}
export interface TransactionResult {
    id: string;
    type: 'DEPOSIT' | 'WITHDRAWAL';
    amount: number;
    currency: string;
    description: string;
    createdAt: Date;
}
export interface GetTransactionsResult {
    accountId: string;
    currentBalance: number;
    currency: string;
    transactions: TransactionResult[];
}
export declare class GetTransactionsUseCase {
    private readonly accountRepo;
    private readonly transactionRepo;
    constructor(accountRepo: IBankAccountRepository, transactionRepo: ITransactionRepository);
    execute(query: GetTransactionsQuery): Promise<GetTransactionsResult>;
}
