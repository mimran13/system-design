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
exports.BankAccountEventHandler = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const notification_entity_1 = require("../../domain/notification.entity");
const notification_repository_interface_1 = require("../../domain/repositories/notification.repository.interface");
let BankAccountEventHandler = class BankAccountEventHandler {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async onAccountOpened(payload) {
        const notification = notification_entity_1.Notification.create({
            accountId: payload.accountId,
            type: 'ACCOUNT_OPENED',
            message: `Your ${payload.currency} account has been opened successfully.`,
        });
        await this.repo.save(notification);
    }
    async onMoneyDeposited(payload) {
        const notification = notification_entity_1.Notification.create({
            accountId: payload.accountId,
            type: 'DEPOSIT',
            message: `Deposit of ${payload.amount} ${payload.currency} received. New balance: ${payload.newBalance} ${payload.currency}.`,
        });
        await this.repo.save(notification);
    }
    async onMoneyWithdrawn(payload) {
        const notification = notification_entity_1.Notification.create({
            accountId: payload.accountId,
            type: 'WITHDRAWAL',
            message: `Withdrawal of ${payload.amount} ${payload.currency} processed. New balance: ${payload.newBalance} ${payload.currency}.`,
        });
        await this.repo.save(notification);
    }
    async onAccountLocked(payload) {
        const notification = notification_entity_1.Notification.create({
            accountId: payload.accountId,
            type: 'ACCOUNT_LOCKED',
            message: `Your account has been locked. Please contact support.`,
        });
        await this.repo.save(notification);
    }
    async onAccountUnlocked(payload) {
        const notification = notification_entity_1.Notification.create({
            accountId: payload.accountId,
            type: 'ACCOUNT_UNLOCKED',
            message: `Your account has been unlocked and is active again.`,
        });
        await this.repo.save(notification);
    }
};
exports.BankAccountEventHandler = BankAccountEventHandler;
__decorate([
    (0, event_emitter_1.OnEvent)('bank-account.account.opened'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BankAccountEventHandler.prototype, "onAccountOpened", null);
__decorate([
    (0, event_emitter_1.OnEvent)('bank-account.money.deposited'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BankAccountEventHandler.prototype, "onMoneyDeposited", null);
__decorate([
    (0, event_emitter_1.OnEvent)('bank-account.money.withdrawn'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BankAccountEventHandler.prototype, "onMoneyWithdrawn", null);
__decorate([
    (0, event_emitter_1.OnEvent)('bank-account.account.locked'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BankAccountEventHandler.prototype, "onAccountLocked", null);
__decorate([
    (0, event_emitter_1.OnEvent)('bank-account.account.unlocked'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BankAccountEventHandler.prototype, "onAccountUnlocked", null);
exports.BankAccountEventHandler = BankAccountEventHandler = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(notification_repository_interface_1.NOTIFICATION_REPOSITORY)),
    __metadata("design:paramtypes", [notification_repository_interface_1.INotificationRepository])
], BankAccountEventHandler);
//# sourceMappingURL=bank-account.event-handler.js.map