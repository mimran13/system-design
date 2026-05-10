import { Repository } from 'typeorm';
import { Notification } from '../../domain/notification.entity';
import { INotificationRepository } from '../../domain/repositories/notification.repository.interface';
import { NotificationOrmEntity } from './notification.orm-entity';
export declare class NotificationTypeOrmRepository extends INotificationRepository {
    private readonly ormRepo;
    constructor(ormRepo: Repository<NotificationOrmEntity>);
    save(notification: Notification): Promise<void>;
    findByAccountId(accountId: string): Promise<Notification[]>;
}
