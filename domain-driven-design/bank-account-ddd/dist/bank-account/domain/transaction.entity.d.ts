import { AccountId } from './value-objects/account-id.vo';
import { Money } from './value-objects/money.vo';
import { TransactionId } from './value-objects/transaction-id.vo';
export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL';
export declare class Transaction {
    readonly id: TransactionId;
    readonly accountId: AccountId;
    readonly type: TransactionType;
    readonly amount: Money;
    readonly description: string;
    readonly createdAt: Date;
    private constructor();
    static create(props: {
        accountId: AccountId;
        type: TransactionType;
        amount: Money;
        description: string;
    }): Transaction;
    static reconstitute(props: {
        id: string;
        accountId: string;
        type: TransactionType;
        amount: number;
        currency: string;
        description: string;
        createdAt: Date;
    }): Transaction;
}
