export declare class TransactionOrmEntity {
    id: string;
    accountId: string;
    type: 'DEPOSIT' | 'WITHDRAWAL';
    amount: number;
    currency: string;
    description: string;
    createdAt: Date;
}
