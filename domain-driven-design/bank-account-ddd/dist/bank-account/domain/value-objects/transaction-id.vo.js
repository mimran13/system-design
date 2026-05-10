"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionId = void 0;
const crypto_1 = require("crypto");
class TransactionId {
    value;
    constructor(value) {
        if (!value || value.trim().length === 0) {
            throw new Error('TransactionId cannot be empty');
        }
        this.value = value;
    }
    static of(value) {
        return new TransactionId(value);
    }
    static generate() {
        return new TransactionId((0, crypto_1.randomUUID)());
    }
    equals(other) {
        return this.value === other.value;
    }
    toString() {
        return this.value;
    }
}
exports.TransactionId = TransactionId;
//# sourceMappingURL=transaction-id.vo.js.map