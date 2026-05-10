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
exports.GetNotificationSummaryUseCase = void 0;
const common_1 = require("@nestjs/common");
const account_info_port_1 = require("../../domain/ports/account-info.port");
const notification_repository_interface_1 = require("../../domain/repositories/notification.repository.interface");
let GetNotificationSummaryUseCase = class GetNotificationSummaryUseCase {
    notificationRepo;
    accountInfoPort;
    constructor(notificationRepo, accountInfoPort) {
        this.notificationRepo = notificationRepo;
        this.accountInfoPort = accountInfoPort;
    }
    async execute(accountId) {
        const accountInfo = await this.accountInfoPort.getAccountInfo(accountId);
        if (!accountInfo)
            return null;
        const notifications = await this.notificationRepo.findByAccountId(accountId);
        return {
            accountId,
            currentBalance: accountInfo.balance,
            currency: accountInfo.currency,
            isLocked: accountInfo.isLocked,
            notificationCount: notifications.length,
            notifications: notifications.map((n) => ({
                type: n.type,
                message: n.message,
                createdAt: n.createdAt,
            })),
        };
    }
};
exports.GetNotificationSummaryUseCase = GetNotificationSummaryUseCase;
exports.GetNotificationSummaryUseCase = GetNotificationSummaryUseCase = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(notification_repository_interface_1.NOTIFICATION_REPOSITORY)),
    __param(1, (0, common_1.Inject)(account_info_port_1.ACCOUNT_INFO_PORT)),
    __metadata("design:paramtypes", [notification_repository_interface_1.INotificationRepository,
        account_info_port_1.IAccountInfoPort])
], GetNotificationSummaryUseCase);
//# sourceMappingURL=get-notification-summary.use-case.js.map