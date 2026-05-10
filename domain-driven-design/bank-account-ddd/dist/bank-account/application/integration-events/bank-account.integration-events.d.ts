export interface AccountOpenedPayload {
    accountId: string;
    currency: string;
    occurredAt: string;
}
export interface MoneyDepositedPayload {
    accountId: string;
    amount: number;
    currency: string;
    newBalance: number;
    occurredAt: string;
}
export interface MoneyWithdrawnPayload {
    accountId: string;
    amount: number;
    currency: string;
    newBalance: number;
    occurredAt: string;
}
export interface AccountLockedPayload {
    accountId: string;
    occurredAt: string;
}
export interface AccountUnlockedPayload {
    accountId: string;
    occurredAt: string;
}
