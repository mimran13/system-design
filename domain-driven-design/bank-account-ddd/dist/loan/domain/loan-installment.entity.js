"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoanInstallment = void 0;
class LoanInstallment {
    installmentNumber;
    amount;
    dueDate;
    _isPaid = false;
    constructor(installmentNumber, amount, dueDate) {
        this.installmentNumber = installmentNumber;
        this.amount = amount;
        this.dueDate = dueDate;
    }
    get isPaid() {
        return this._isPaid;
    }
    markAsPaid() {
        if (this._isPaid) {
            throw new Error(`Installment #${this.installmentNumber} is already paid`);
        }
        this._isPaid = true;
    }
    static create(installmentNumber, amount, dueDate) {
        return new LoanInstallment(installmentNumber, amount, dueDate);
    }
}
exports.LoanInstallment = LoanInstallment;
//# sourceMappingURL=loan-installment.entity.js.map