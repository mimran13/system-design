"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankAccountTypeOrmRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bank_account_aggregate_1 = require("../../domain/bank-account.aggregate");
const domain_errors_1 = require("../../domain/errors/domain.errors");
const bank_account_repository_interface_1 = require("../../domain/repositories/bank-account.repository.interface");
const bank_account_orm_entity_1 = require("./bank-account.orm-entity");
let BankAccountTypeOrmRepository = class BankAccountTypeOrmRepository extends bank_account_repository_interface_1.IBankAccountRepository {
    ormRepo;
    constructor(ormRepo) {
        super();
        this.ormRepo = ormRepo;
    }
    async findById(id) {
        const row = await this.ormRepo.findOne({ where: { id: id.value } });
        if (!row)
            return null;
        return bank_account_aggregate_1.BankAccount.reconstitute({
            id: row.id,
            balanceAmount: Number(row.balanceAmount),
            balanceCurrency: row.balanceCurrency,
            isLocked: row.isLocked,
            version: row.version,
            createdAt: row.createdAt,
        });
    }
    async save(account) {
        const entity = this.toOrmEntity(account);
        try {
            await this.ormRepo.save(entity);
            account.incrementVersion();
        }
        catch (error) {
            if (error.name === 'OptimisticLockVersionMismatchError' ||
                (error.message && error.message.includes('version'))) {
                throw new domain_errors_1.ConcurrentModificationError(account.id.toString());
            }
            throw error;
        }
    }
    toOrmEntity(account) {
        const entity = new bank_account_orm_entity_1.BankAccountOrmEntity();
        entity.id = account.id.value;
        entity.balanceAmount = account.balance.amount;
        entity.balanceCurrency = account.balance.currency;
        entity.isLocked = account.isLocked;
        entity.version = account.version;
        entity.createdAt = account.createdAt;
        return entity;
    }
};
exports.BankAccountTypeOrmRepository = BankAccountTypeOrmRepository;
exports.BankAccountTypeOrmRepository = BankAccountTypeOrmRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(bank_account_orm_entity_1.BankAccountOrmEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], BankAccountTypeOrmRepository);
//# sourceMappingURL=bank-account.typeorm-repository.js.map