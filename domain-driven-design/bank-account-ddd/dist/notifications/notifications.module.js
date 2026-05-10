"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const bank_account_module_1 = require("../bank-account/bank-account.module");
const bank_account_event_handler_1 = require("./application/event-handlers/bank-account.event-handler");
const get_notification_summary_use_case_1 = require("./application/use-cases/get-notification-summary.use-case");
const account_info_port_1 = require("./domain/ports/account-info.port");
const notification_repository_interface_1 = require("./domain/repositories/notification.repository.interface");
const bank_account_info_adapter_1 = require("./infrastructure/adapters/bank-account-info.adapter");
const notification_orm_entity_1 = require("./infrastructure/persistence/notification.orm-entity");
const notification_typeorm_repository_1 = require("./infrastructure/persistence/notification.typeorm-repository");
const notifications_controller_1 = require("./presentation/notifications.controller");
let NotificationsModule = class NotificationsModule {
};
exports.NotificationsModule = NotificationsModule;
exports.NotificationsModule = NotificationsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([notification_orm_entity_1.NotificationOrmEntity]),
            bank_account_module_1.BankAccountModule,
        ],
        controllers: [notifications_controller_1.NotificationsController],
        providers: [
            bank_account_event_handler_1.BankAccountEventHandler,
            bank_account_info_adapter_1.BankAccountInfoAdapter,
            get_notification_summary_use_case_1.GetNotificationSummaryUseCase,
            {
                provide: notification_repository_interface_1.NOTIFICATION_REPOSITORY,
                useClass: notification_typeorm_repository_1.NotificationTypeOrmRepository,
            },
            {
                provide: account_info_port_1.ACCOUNT_INFO_PORT,
                useClass: bank_account_info_adapter_1.BankAccountInfoAdapter,
            },
        ],
    })
], NotificationsModule);
//# sourceMappingURL=notifications.module.js.map