"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Transaction = void 0;
const domain_errors_1 = require("./errors/domain.errors");
const account_id_vo_1 = require("./value-objects/account-id.vo");
const money_vo_1 = require("./value-objects/money.vo");
const transaction_id_vo_1 = require("./value-objects/transaction-id.vo");
class Transaction {
    id;
    accountId;
    type;
    amount;
    description;
    createdAt;
    constructor(props) {
        this.id = props.id;
        this.accountId = props.accountId;
        this.type = props.type;
        this.amount = props.amount;
        this.description = props.description;
        this.createdAt = props.createdAt;
    }
    static create(props) {
        if (!props.description || props.description.trim().length === 0) {
            throw new domain_errors_1.InvalidTransactionDescriptionError();
        }
        return new Transaction({
            id: transaction_id_vo_1.TransactionId.generate(),
            accountId: props.accountId,
            type: props.type,
            amount: props.amount,
            description: props.description.trim(),
            createdAt: new Date(),
        });
    }
    static reconstitute(props) {
        return new Transaction({
            id: transaction_id_vo_1.TransactionId.of(props.id),
            accountId: account_id_vo_1.AccountId.of(props.accountId),
            type: props.type,
            amount: money_vo_1.Money.of(props.amount, props.currency),
            description: props.description,
            createdAt: props.createdAt,
        });
    }
}
exports.Transaction = Transaction;
//# sourceMappingURL=transaction.entity.js.map