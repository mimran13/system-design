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
exports.TransactionTypeOrmRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const transaction_repository_interface_1 = require("../../domain/repositories/transaction.repository.interface");
const transaction_entity_1 = require("../../domain/transaction.entity");
const transaction_orm_entity_1 = require("./transaction.orm-entity");
let TransactionTypeOrmRepository = class TransactionTypeOrmRepository extends transaction_repository_interface_1.ITransactionRepository {
    ormRepo;
    constructor(ormRepo) {
        super();
        this.ormRepo = ormRepo;
    }
    async save(transaction) {
        const entity = this.toOrmEntity(transaction);
        await this.ormRepo.save(entity);
    }
    async findByAccountId(accountId, limit = 20, offset = 0) {
        const rows = await this.ormRepo.find({
            where: { accountId: accountId.value },
            order: { createdAt: 'DESC' },
            take: limit,
            skip: offset,
        });
        return rows.map((row) => transaction_entity_1.Transaction.reconstitute({
            id: row.id,
            accountId: row.accountId,
            type: row.type,
            amount: row.amount,
            currency: row.currency,
            description: row.description,
            createdAt: row.createdAt,
        }));
    }
    toOrmEntity(transaction) {
        const entity = new transaction_orm_entity_1.TransactionOrmEntity();
        entity.id = transaction.id.value;
        entity.accountId = transaction.accountId.value;
        entity.type = transaction.type;
        entity.amount = transaction.amount.amount;
        entity.currency = transaction.amount.currency;
        entity.description = transaction.description;
        entity.createdAt = transaction.createdAt;
        return entity;
    }
};
exports.TransactionTypeOrmRepository = TransactionTypeOrmRepository;
exports.TransactionTypeOrmRepository = TransactionTypeOrmRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(transaction_orm_entity_1.TransactionOrmEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], TransactionTypeOrmRepository);
//# sourceMappingURL=transaction.typeorm-repository.js.map