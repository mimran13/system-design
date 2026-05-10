export declare class AccountId {
    readonly value: string;
    private constructor();
    static of(value: string): AccountId;
    static generate(): AccountId;
    equals(other: AccountId): boolean;
    toString(): string;
}
