"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidTransactionDescriptionError = exports.ConcurrentModificationError = exports.AccountNotFoundError = exports.AccountLockedError = exports.InsufficientFundsError = void 0;
class InsufficientFundsError extends Error {
    constructor(available, requested) {
        super(`Insufficient funds. Available: ${available}, Requested: ${requested}`);
        this.name = 'InsufficientFundsError';
    }
}
exports.InsufficientFundsError = InsufficientFundsError;
class AccountLockedError extends Error {
    constructor(accountId) {
        super(`Account ${accountId} is locked and cannot process transactions`);
        this.name = 'AccountLockedError';
    }
}
exports.AccountLockedError = AccountLockedError;
class AccountNotFoundError extends Error {
    constructor(accountId) {
        super(`Account ${accountId} not found`);
        this.name = 'AccountNotFoundError';
    }
}
exports.AccountNotFoundError = AccountNotFoundError;
class ConcurrentModificationError extends Error {
    constructor(accountId) {
        super(`Account ${accountId} was modified by another request. Please retry.`);
        this.name = 'ConcurrentModificationError';
    }
}
exports.ConcurrentModificationError = ConcurrentModificationError;
class InvalidTransactionDescriptionError extends Error {
    constructor() {
        super('Transaction description is required and cannot be empty');
        this.name = 'InvalidTransactionDescriptionError';
    }
}
exports.InvalidTransactionDescriptionError = InvalidTransactionDescriptionError;
//# sourceMappingURL=domain.errors.js.map