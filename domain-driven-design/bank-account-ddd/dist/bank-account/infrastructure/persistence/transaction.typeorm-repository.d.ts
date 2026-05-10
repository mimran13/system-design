import { Repository } from 'typeorm';
import { ITransactionRepository } from '../../domain/repositories/transaction.repository.interface';
import { Transaction } from '../../domain/transaction.entity';
import { AccountId } from '../../domain/value-objects/account-id.vo';
import { TransactionOrmEntity } from './transaction.orm-entity';
export declare class TransactionTypeOrmRepository extends ITransactionRepository {
    private readonly ormRepo;
    constructor(ormRepo: Repository<TransactionOrmEntity>);
    save(transaction: Transaction): Promise<void>;
    findByAccountId(accountId: AccountId, limit?: number, offset?: number): Promise<Transaction[]>;
    private toOrmEntity;
}
