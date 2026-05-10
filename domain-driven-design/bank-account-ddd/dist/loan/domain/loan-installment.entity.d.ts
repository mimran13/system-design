import { Money } from '../../bank-account/domain/value-objects/money.vo';
export declare class LoanInstallment {
    readonly installmentNumber: number;
    readonly amount: Money;
    readonly dueDate: Date;
    private _isPaid;
    private constructor();
    get isPaid(): boolean;
    markAsPaid(): void;
    static create(installmentNumber: number, amount: Money, dueDate: Date): LoanInstallment;
}
