"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Money = void 0;
class Money {
    amount;
    currency;
    constructor(amount, currency) {
        if (amount < 0) {
            throw new Error(`Money amount cannot be negative: ${amount}`);
        }
        if (!currency || currency.trim().length !== 3) {
            throw new Error(`Invalid currency code: ${currency}`);
        }
        this.amount = amount;
        this.currency = currency.toUpperCase();
    }
    static of(amount, currency) {
        return new Money(amount, currency);
    }
    static usd(amount) {
        return new Money(amount, 'USD');
    }
    static zero(currency = 'USD') {
        return new Money(0, currency);
    }
    add(other) {
        this.assertSameCurrency(other);
        return new Money(this.amount + other.amount, this.currency);
    }
    subtract(other) {
        this.assertSameCurrency(other);
        if (other.amount > this.amount) {
            throw new Error(`Insufficient funds: cannot subtract ${other.toString()} from ${this.toString()}`);
        }
        return new Money(this.amount - other.amount, this.currency);
    }
    isGreaterThan(other) {
        this.assertSameCurrency(other);
        return this.amount > other.amount;
    }
    isGreaterThanOrEqual(other) {
        this.assertSameCurrency(other);
        return this.amount >= other.amount;
    }
    equals(other) {
        return this.amount === other.amount && this.currency === other.currency;
    }
    toString() {
        return `${this.currency} ${this.amount.toFixed(2)}`;
    }
    assertSameCurrency(other) {
        if (this.currency !== other.currency) {
            throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
        }
    }
}
exports.Money = Money;
//# sourceMappingURL=money.vo.js.map