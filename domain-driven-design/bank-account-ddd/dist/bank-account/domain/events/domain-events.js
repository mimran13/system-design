"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountUnlockedEvent = exports.AccountLockedEvent = exports.MoneyWithdrawnEvent = exports.MoneyDepositedEvent = exports.AccountOpenedEvent = exports.DomainEvent = void 0;
class DomainEvent {
    occurredAt;
    constructor() {
        this.occurredAt = new Date();
    }
}
exports.DomainEvent = DomainEvent;
class AccountOpenedEvent extends DomainEvent {
    accountId;
    currency;
    constructor(accountId, currency) {
        super();
        this.accountId = accountId;
        this.currency = currency;
    }
}
exports.AccountOpenedEvent = AccountOpenedEvent;
class MoneyDepositedEvent extends DomainEvent {
    accountId;
    amount;
    currency;
    newBalance;
    constructor(accountId, amount, currency, newBalance) {
        super();
        this.accountId = accountId;
        this.amount = amount;
        this.currency = currency;
        this.newBalance = newBalance;
    }
}
exports.MoneyDepositedEvent = MoneyDepositedEvent;
class MoneyWithdrawnEvent extends DomainEvent {
    accountId;
    amount;
    currency;
    newBalance;
    constructor(accountId, amount, currency, newBalance) {
        super();
        this.accountId = accountId;
        this.amount = amount;
        this.currency = currency;
        this.newBalance = newBalance;
    }
}
exports.MoneyWithdrawnEvent = MoneyWithdrawnEvent;
class AccountLockedEvent extends DomainEvent {
    accountId;
    constructor(accountId) {
        super();
        this.accountId = accountId;
    }
}
exports.AccountLockedEvent = AccountLockedEvent;
class AccountUnlockedEvent extends DomainEvent {
    accountId;
    constructor(accountId) {
        super();
        this.accountId = accountId;
    }
}
exports.AccountUnlockedEvent = AccountUnlockedEvent;
//# sourceMappingURL=domain-events.js.map