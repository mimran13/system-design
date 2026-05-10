import { Money } from '../../bank-account/domain/value-objects/money.vo';
import { LoanInstallment } from './loan-installment.entity';
type LoanStatus = 'PENDING' | 'APPROVED' | 'SETTLED' | 'REJECTED';
export declare class LoanApplication {
    readonly id: string;
    readonly principalAmount: Money;
    readonly termMonths: number;
    private _status;
    private readonly _installments;
    private constructor();
    get status(): LoanStatus;
    get installments(): ReadonlyArray<LoanInstallment>;
    static apply(id: string, principalAmount: Money, termMonths: number): LoanApplication;
    approve(annualInterestRate: number): void;
    payInstallment(installmentNumber: number): void;
    reject(): void;
    private calculateMonthlyPayment;
}
export {};
