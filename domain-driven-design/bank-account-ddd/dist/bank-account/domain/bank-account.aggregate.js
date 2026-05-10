"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankAccount = void 0;
const domain_errors_1 = require("./errors/domain.errors");
const domain_events_1 = require("./events/domain-events");
const account_id_vo_1 = require("./value-objects/account-id.vo");
const money_vo_1 = require("./value-objects/money.vo");
class BankAccount {
    _id;
    _balance;
    _isLocked;
    _version;
    _createdAt;
    _domainEvents = [];
    constructor(props) {
        this._id = props.id;
        this._balance = props.balance;
        this._isLocked = props.isLocked;
        this._version = props.version;
        this._createdAt = props.createdAt;
    }
    get id() {
        return this._id;
    }
    get balance() {
        return this._balance;
    }
    get isLocked() {
        return this._isLocked;
    }
    get version() {
        return this._version;
    }
    get createdAt() {
        return this._createdAt;
    }
    pullDomainEvents() {
        const events = [...this._domainEvents];
        this._domainEvents.length = 0;
        return events;
    }
    static open(currency = 'USD') {
        const account = new BankAccount({
            id: account_id_vo_1.AccountId.generate(),
            balance: money_vo_1.Money.zero(currency),
            isLocked: false,
            version: 0,
            createdAt: new Date(),
        });
        account._domainEvents.push(new domain_events_1.AccountOpenedEvent(account._id.value, currency));
        return account;
    }
    static reconstitute(props) {
        return new BankAccount({
            id: account_id_vo_1.AccountId.of(props.id),
            balance: money_vo_1.Money.of(props.balanceAmount, props.balanceCurrency),
            isLocked: props.isLocked,
            version: props.version,
            createdAt: props.createdAt,
        });
    }
    deposit(amount) {
        this.assertNotLocked();
        this._balance = this._balance.add(amount);
        this._domainEvents.push(new domain_events_1.MoneyDepositedEvent(this._id.value, amount.amount, amount.currency, this._balance.amount));
        return this._balance;
    }
    withdraw(amount) {
        this.assertNotLocked();
        if (!this._balance.isGreaterThanOrEqual(amount)) {
            throw new domain_errors_1.InsufficientFundsError(this._balance.toString(), amount.toString());
        }
        this._balance = this._balance.subtract(amount);
        this._domainEvents.push(new domain_events_1.MoneyWithdrawnEvent(this._id.value, amount.amount, amount.currency, this._balance.amount));
        return this._balance;
    }
    lock() {
        this._isLocked = true;
        this._domainEvents.push(new domain_events_1.AccountLockedEvent(this._id.value));
    }
    unlock() {
        this._isLocked = false;
        this._domainEvents.push(new domain_events_1.AccountUnlockedEvent(this._id.value));
    }
    incrementVersion() {
        this._version++;
    }
    assertNotLocked() {
        if (this._isLocked) {
            throw new domain_errors_1.AccountLockedError(this._id.toString());
        }
    }
}
exports.BankAccount = BankAccount;
//# sourceMappingURL=bank-account.aggregate.js.map