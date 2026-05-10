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
exports.NotificationTypeOrmRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const notification_entity_1 = require("../../domain/notification.entity");
const notification_repository_interface_1 = require("../../domain/repositories/notification.repository.interface");
const notification_orm_entity_1 = require("./notification.orm-entity");
let NotificationTypeOrmRepository = class NotificationTypeOrmRepository extends notification_repository_interface_1.INotificationRepository {
    ormRepo;
    constructor(ormRepo) {
        super();
        this.ormRepo = ormRepo;
    }
    async save(notification) {
        const orm = this.ormRepo.create({
            id: notification.id,
            accountId: notification.accountId,
            type: notification.type,
            message: notification.message,
            createdAt: notification.createdAt,
        });
        await this.ormRepo.save(orm);
    }
    async findByAccountId(accountId) {
        const rows = await this.ormRepo.find({
            where: { accountId },
            order: { createdAt: 'DESC' },
        });
        return rows.map((row) => notification_entity_1.Notification.create({
            accountId: row.accountId,
            type: row.type,
            message: row.message,
        }));
    }
};
exports.NotificationTypeOrmRepository = NotificationTypeOrmRepository;
exports.NotificationTypeOrmRepository = NotificationTypeOrmRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(notification_orm_entity_1.NotificationOrmEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], NotificationTypeOrmRepository);
//# sourceMappingURL=notification.typeorm-repository.js.map