export declare class Money {
    readonly amount: number;
    readonly currency: string;
    private constructor();
    static of(amount: number, currency: string): Money;
    static usd(amount: number): Money;
    static zero(currency?: string): Money;
    add(other: Money): Money;
    subtract(other: Money): Money;
    isGreaterThan(other: Money): boolean;
    isGreaterThanOrEqual(other: Money): boolean;
    equals(other: Money): boolean;
    toString(): string;
    private assertSameCurrency;
}
