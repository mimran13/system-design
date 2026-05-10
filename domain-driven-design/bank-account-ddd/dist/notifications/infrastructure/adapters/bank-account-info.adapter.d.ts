import { GetAccountBalanceQuery } from '../../../bank-account/application/queries/get-account-balance.query';
import { AccountInfo, IAccountInfoPort } from '../../domain/ports/account-info.port';
export declare class BankAccountInfoAdapter extends IAccountInfoPort {
    private readonly query;
    constructor(query: GetAccountBalanceQuery);
    getAccountInfo(accountId: string): Promise<AccountInfo | null>;
}
