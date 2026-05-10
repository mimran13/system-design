import { INotificationRepository } from '../../domain/repositories/notification.repository.interface';
interface MoneyMovedPayload {
    accountId: string;
    amount: number;
    currency: string;
    newBalance: number;
}
interface AccountOpenedPayload {
    accountId: string;
    currency: string;
}
interface AccountStatusPayload {
    accountId: string;
}
export declare class BankAccountEventHandler {
    private readonly repo;
    constructor(repo: INotificationRepository);
    onAccountOpened(payload: AccountOpenedPayload): Promise<void>;
    onMoneyDeposited(payload: MoneyMovedPayload): Promise<void>;
    onMoneyWithdrawn(payload: MoneyMovedPayload): Promise<void>;
    onAccountLocked(payload: AccountStatusPayload): Promise<void>;
    onAccountUnlocked(payload: AccountStatusPayload): Promise<void>;
}
export {};
