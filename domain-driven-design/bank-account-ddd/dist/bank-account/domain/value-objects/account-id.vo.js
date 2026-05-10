"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountId = void 0;
const crypto_1 = require("crypto");
class AccountId {
    value;
    constructor(value) {
        if (!value || value.trim().length === 0) {
            throw new Error('AccountId cannot be empty');
        }
        this.value = value;
    }
    static of(value) {
        return new AccountId(value);
    }
    static generate() {
        return new AccountId((0, crypto_1.randomUUID)());
    }
    equals(other) {
        return this.value === other.value;
    }
    toString() {
        return this.value;
    }
}
exports.AccountId = AccountId;
//# sourceMappingURL=account-id.vo.js.map