import { BankAccount } from '../bank-account.aggregate';
import { AccountId } from '../value-objects/account-id.vo';
export declare abstract class IBankAccountRepository {
    abstract findById(id: AccountId): Promise<BankAccount | null>;
    abstract save(account: BankAccount): Promise<void>;
}
export declare const BANK_ACCOUNT_REPOSITORY: unique symbol;
