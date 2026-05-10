export type NotificationType = 'ACCOUNT_OPENED' | 'DEPOSIT' | 'WITHDRAWAL' | 'ACCOUNT_LOCKED' | 'ACCOUNT_UNLOCKED';
export declare class Notification {
    readonly id: string;
    readonly accountId: string;
    readonly type: NotificationType;
    readonly message: string;
    readonly createdAt: Date;
    private constructor();
    static create(props: {
        accountId: string;
        type: NotificationType;
        message: string;
    }): Notification;
}
