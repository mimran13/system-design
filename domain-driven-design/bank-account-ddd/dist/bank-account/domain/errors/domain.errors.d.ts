export declare class InsufficientFundsError extends Error {
    constructor(available: string, requested: string);
}
export declare class AccountLockedError extends Error {
    constructor(accountId: string);
}
export declare class AccountNotFoundError extends Error {
    constructor(accountId: string);
}
export declare class ConcurrentModificationError extends Error {
    constructor(accountId: string);
}
export declare class InvalidTransactionDescriptionError extends Error {
    constructor();
}
