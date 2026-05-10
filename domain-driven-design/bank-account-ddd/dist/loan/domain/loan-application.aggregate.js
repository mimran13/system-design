"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoanApplication = void 0;
const money_vo_1 = require("../../bank-account/domain/value-objects/money.vo");
const loan_installment_entity_1 = require("./loan-installment.entity");
class LoanApplication {
    id;
    principalAmount;
    termMonths;
    _status;
    _installments;
    constructor(id, principalAmount, termMonths, status, installments) {
        this.id = id;
        this.principalAmount = principalAmount;
        this.termMonths = termMonths;
        this._status = status;
        this._installments = installments;
    }
    get status() {
        return this._status;
    }
    get installments() {
        return [...this._installments];
    }
    static apply(id, principalAmount, termMonths) {
        return new LoanApplication(id, principalAmount, termMonths, 'PENDING', []);
    }
    approve(annualInterestRate) {
        if (this._status !== 'PENDING') {
            throw new Error(`Cannot approve a loan that is already ${this._status}`);
        }
        this._status = 'APPROVED';
        const monthlyAmount = this.calculateMonthlyPayment(annualInterestRate);
        for (let month = 1; month <= this.termMonths; month++) {
            const dueDate = new Date();
            dueDate.setMonth(dueDate.getMonth() + month);
            this._installments.push(loan_installment_entity_1.LoanInstallment.create(month, money_vo_1.Money.of(monthlyAmount, this.principalAmount.currency), dueDate));
        }
    }
    payInstallment(installmentNumber) {
        if (this._status !== 'APPROVED') {
            throw new Error(`Cannot pay installment — loan is ${this._status}`);
        }
        const installment = this._installments.find((i) => i.installmentNumber === installmentNumber);
        if (!installment) {
            throw new Error(`Installment #${installmentNumber} not found`);
        }
        installment.markAsPaid();
        if (this._installments.every((i) => i.isPaid)) {
            this._status = 'SETTLED';
        }
    }
    reject() {
        if (this._status !== 'PENDING') {
            throw new Error(`Cannot reject a loan that is already ${this._status}`);
        }
        this._status = 'REJECTED';
    }
    calculateMonthlyPayment(annualInterestRate) {
        const monthlyRate = annualInterestRate / 12 / 100;
        const n = this.termMonths;
        const payment = (this.principalAmount.amount * monthlyRate * Math.pow(1 + monthlyRate, n)) /
            (Math.pow(1 + monthlyRate, n) - 1);
        return Math.round(payment * 100) / 100;
    }
}
exports.LoanApplication = LoanApplication;
//# sourceMappingURL=loan-application.aggregate.js.map