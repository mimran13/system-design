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
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const get_notification_summary_use_case_1 = require("../application/use-cases/get-notification-summary.use-case");
const notification_repository_interface_1 = require("../domain/repositories/notification.repository.interface");
let NotificationsController = class NotificationsController {
    repo;
    getSummary;
    constructor(repo, getSummary) {
        this.repo = repo;
        this.getSummary = getSummary;
    }
    async getForAccount(accountId) {
        const notifications = await this.repo.findByAccountId(accountId);
        return notifications.map((n) => ({
            id: n.id,
            type: n.type,
            message: n.message,
            createdAt: n.createdAt,
        }));
    }
    async getSummaryForAccount(accountId) {
        const result = await this.getSummary.execute(accountId);
        if (!result)
            throw new common_1.NotFoundException(`Account ${accountId} not found`);
        return result;
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Get)(':accountId'),
    __param(0, (0, common_1.Param)('accountId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getForAccount", null);
__decorate([
    (0, common_1.Get)(':accountId/summary'),
    __param(0, (0, common_1.Param)('accountId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getSummaryForAccount", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, common_1.Controller)('notifications'),
    __param(0, (0, common_1.Inject)(notification_repository_interface_1.NOTIFICATION_REPOSITORY)),
    __metadata("design:paramtypes", [notification_repository_interface_1.INotificationRepository,
        get_notification_summary_use_case_1.GetNotificationSummaryUseCase])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map