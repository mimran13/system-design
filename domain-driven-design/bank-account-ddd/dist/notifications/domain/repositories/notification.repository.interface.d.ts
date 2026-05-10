import { Notification } from '../notification.entity';
export declare const NOTIFICATION_REPOSITORY: unique symbol;
export declare abstract class INotificationRepository {
    abstract save(notification: Notification): Promise<void>;
    abstract findByAccountId(accountId: string): Promise<Notification[]>;
}
