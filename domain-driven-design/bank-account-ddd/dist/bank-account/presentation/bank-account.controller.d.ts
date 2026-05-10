import { DepositMoneyUseCase } from '../application/use-cases/deposit-money.use-case';
import { GetTransactionsUseCase } from '../application/use-cases/get-transactions.use-case';
import { OpenAccountUseCase } from '../application/use-cases/open-account.use-case';
import { WithdrawMoneyUseCase } from '../application/use-cases/withdraw-money.use-case';
export declare class BankAccountController {
    private readonly openAccountUseCase;
    private readonly depositMoneyUseCase;
    private readonly withdrawMoneyUseCase;
    private readonly getTransactionsUseCase;
    constructor(openAccountUseCase: OpenAccountUseCase, depositMoneyUseCase: DepositMoneyUseCase, withdrawMoneyUseCase: WithdrawMoneyUseCase, getTransactionsUseCase: GetTransactionsUseCase);
    openAccount(body: {
        currency?: string;
    }): Promise<{
        accountId: string;
        balance: number;
        currency: string;
        message: string;
    }>;
    deposit(accountId: string, body: {
        amount: number;
        currency: string;
        description: string;
    }): Promise<{
        transactionId: string;
        newBalance: number;
        currency: string;
    }>;
    withdraw(accountId: string, body: {
        amount: number;
        currency: string;
        description: string;
    }): Promise<{
        transactionId: string;
        newBalance: number;
        currency: string;
    }>;
    getTransactions(accountId: string, limit?: string, offset?: string): Promise<import("../application/use-cases/get-transactions.use-case").GetTransactionsResult>;
    private mapDomainError;
}
