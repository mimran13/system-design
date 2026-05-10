export declare const ACCOUNT_INFO_PORT: unique symbol;
export interface AccountInfo {
    accountId: string;
    balance: number;
    currency: string;
    isLocked: boolean;
}
export declare abstract class IAccountInfoPort {
    abstract getAccountInfo(accountId: string): Promise<AccountInfo | null>;
}
