import { IAccountInfoPort } from '../../domain/ports/account-info.port';
import { INotificationRepository } from '../../domain/repositories/notification.repository.interface';
export interface NotificationSummaryResult {
    accountId: string;
    currentBalance: number;
    currency: string;
    isLocked: boolean;
    notificationCount: number;
    notifications: {
        type: string;
        message: string;
        createdAt: Date;
    }[];
}
export declare class GetNotificationSummaryUseCase {
    private readonly notificationRepo;
    private readonly accountInfoPort;
    constructor(notificationRepo: INotificationRepository, accountInfoPort: IAccountInfoPort);
    execute(accountId: string): Promise<NotificationSummaryResult | null>;
}
