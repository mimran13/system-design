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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionOrmEntity = void 0;
const typeorm_1 = require("typeorm");
let TransactionOrmEntity = class TransactionOrmEntity {
    id;
    accountId;
    type;
    amount;
    currency;
    description;
    createdAt;
};
exports.TransactionOrmEntity = TransactionOrmEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)('uuid'),
    __metadata("design:type", String)
], TransactionOrmEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('uuid'),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], TransactionOrmEntity.prototype, "accountId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], TransactionOrmEntity.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)('decimal', { precision: 15, scale: 2 }),
    __metadata("design:type", Number)
], TransactionOrmEntity.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 3 }),
    __metadata("design:type", String)
], TransactionOrmEntity.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 500 }),
    __metadata("design:type", String)
], TransactionOrmEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], TransactionOrmEntity.prototype, "createdAt", void 0);
exports.TransactionOrmEntity = TransactionOrmEntity = __decorate([
    (0, typeorm_1.Entity)('transactions')
], TransactionOrmEntity);
//# sourceMappingURL=transaction.orm-entity.js.map