"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankAccountModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const integration_event_publisher_1 = require("./application/event-handlers/integration-event-publisher");
const get_account_balance_query_1 = require("./application/queries/get-account-balance.query");
const deposit_money_use_case_1 = require("./application/use-cases/deposit-money.use-case");
const get_transactions_use_case_1 = require("./application/use-cases/get-transactions.use-case");
const open_account_use_case_1 = require("./application/use-cases/open-account.use-case");
const withdraw_money_use_case_1 = require("./application/use-cases/withdraw-money.use-case");
const bank_account_repository_interface_1 = require("./domain/repositories/bank-account.repository.interface");
const transaction_repository_interface_1 = require("./domain/repositories/transaction.repository.interface");
const bank_account_orm_entity_1 = require("./infrastructure/persistence/bank-account.orm-entity");
const bank_account_typeorm_repository_1 = require("./infrastructure/persistence/bank-account.typeorm-repository");
const transaction_orm_entity_1 = require("./infrastructure/persistence/transaction.orm-entity");
const transaction_typeorm_repository_1 = require("./infrastructure/persistence/transaction.typeorm-repository");
const bank_account_controller_1 = require("./presentation/bank-account.controller");
let BankAccountModule = class BankAccountModule {
};
exports.BankAccountModule = BankAccountModule;
exports.BankAccountModule = BankAccountModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([bank_account_orm_entity_1.BankAccountOrmEntity, transaction_orm_entity_1.TransactionOrmEntity]),
        ],
        controllers: [bank_account_controller_1.BankAccountController],
        providers: [
            integration_event_publisher_1.IntegrationEventPublisher,
            get_account_balance_query_1.GetAccountBalanceQuery,
            open_account_use_case_1.OpenAccountUseCase,
            deposit_money_use_case_1.DepositMoneyUseCase,
            withdraw_money_use_case_1.WithdrawMoneyUseCase,
            get_transactions_use_case_1.GetTransactionsUseCase,
            {
                provide: bank_account_repository_interface_1.BANK_ACCOUNT_REPOSITORY,
                useClass: bank_account_typeorm_repository_1.BankAccountTypeOrmRepository,
            },
            {
                provide: transaction_repository_interface_1.TRANSACTION_REPOSITORY,
                useClass: transaction_typeorm_repository_1.TransactionTypeOrmRepository,
            },
        ],
        exports: [get_account_balance_query_1.GetAccountBalanceQuery],
    })
], BankAccountModule);
//# sourceMappingURL=bank-account.module.js.map