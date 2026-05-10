import { GetNotificationSummaryUseCase } from '../application/use-cases/get-notification-summary.use-case';
import { INotificationRepository } from '../domain/repositories/notification.repository.interface';
export declare class NotificationsController {
    private readonly repo;
    private readonly getSummary;
    constructor(repo: INotificationRepository, getSummary: GetNotificationSummaryUseCase);
    getForAccount(accountId: string): Promise<{
        id: string;
        type: import("../domain/notification.entity").NotificationType;
        message: string;
        createdAt: Date;
    }[]>;
    getSummaryForAccount(accountId: string): Promise<import("../application/use-cases/get-notification-summary.use-case").NotificationSummaryResult>;
}
