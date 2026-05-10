import { AccountId } from '../value-objects/account-id.vo';
import { Transaction } from '../transaction.entity';
export declare abstract class ITransactionRepository {
    abstract save(transaction: Transaction): Promise<void>;
    abstract findByAccountId(accountId: AccountId, limit?: number, offset?: number): Promise<Transaction[]>;
}
export declare const TRANSACTION_REPOSITORY: unique symbol;
