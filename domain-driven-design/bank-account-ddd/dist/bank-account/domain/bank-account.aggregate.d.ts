import { DomainEvent } from './events/domain-events';
import { AccountId } from './value-objects/account-id.vo';
import { Money } from './value-objects/money.vo';
export declare class BankAccount {
    private readonly _id;
    private _balance;
    private _isLocked;
    private _version;
    private readonly _createdAt;
    private readonly _domainEvents;
    private constructor();
    get id(): AccountId;
    get balance(): Money;
    get isLocked(): boolean;
    get version(): number;
    get createdAt(): Date;
    pullDomainEvents(): DomainEvent[];
    static open(currency?: string): BankAccount;
    static reconstitute(props: {
        id: string;
        balanceAmount: number;
        balanceCurrency: string;
        isLocked: boolean;
        version: number;
        createdAt: Date;
    }): BankAccount;
    deposit(amount: Money): Money;
    withdraw(amount: Money): Money;
    lock(): void;
    unlock(): void;
    incrementVersion(): void;
    private assertNotLocked;
}
