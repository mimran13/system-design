export declare class TransactionId {
    readonly value: string;
    private constructor();
    static of(value: string): TransactionId;
    static generate(): TransactionId;
    equals(other: TransactionId): boolean;
    toString(): string;
}
