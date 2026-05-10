export declare abstract class DomainEvent {
    readonly occurredAt: Date;
    constructor();
}
export declare class AccountOpenedEvent extends DomainEvent {
    readonly accountId: string;
    readonly currency: string;
    constructor(accountId: string, currency: string);
}
export declare class MoneyDepositedEvent extends DomainEvent {
    readonly accountId: string;
    readonly amount: number;
    readonly currency: string;
    readonly newBalance: number;
    constructor(accountId: string, amount: number, currency: string, newBalance: number);
}
export declare class MoneyWithdrawnEvent extends DomainEvent {
    readonly accountId: string;
    readonly amount: number;
    readonly currency: string;
    readonly newBalance: number;
    constructor(accountId: string, amount: number, currency: string, newBalance: number);
}
export declare class AccountLockedEvent extends DomainEvent {
    readonly accountId: string;
    constructor(accountId: string);
}
export declare class AccountUnlockedEvent extends DomainEvent {
    readonly accountId: string;
    constructor(accountId: string);
}
