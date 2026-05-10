import { IBankAccountRepository } from '../../domain/repositories/bank-account.repository.interface';
export interface AccountBalanceResult {
    accountId: string;
    balance: number;
    currency: string;
    isLocked: boolean;
}
export declare class GetAccountBalanceQuery {
    private readonly repo;
    constructor(repo: IBankAccountRepository);
    execute(accountId: string): Promise<AccountBalanceResult | null>;
}
