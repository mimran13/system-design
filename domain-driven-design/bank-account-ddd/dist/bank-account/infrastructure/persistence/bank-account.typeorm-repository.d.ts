import { Repository } from 'typeorm';
import { BankAccount } from '../../domain/bank-account.aggregate';
import { IBankAccountRepository } from '../../domain/repositories/bank-account.repository.interface';
import { AccountId } from '../../domain/value-objects/account-id.vo';
import { BankAccountOrmEntity } from './bank-account.orm-entity';
export declare class BankAccountTypeOrmRepository extends IBankAccountRepository {
    private readonly ormRepo;
    constructor(ormRepo: Repository<BankAccountOrmEntity>);
    findById(id: AccountId): Promise<BankAccount | null>;
    save(account: BankAccount): Promise<void>;
    private toOrmEntity;
}
