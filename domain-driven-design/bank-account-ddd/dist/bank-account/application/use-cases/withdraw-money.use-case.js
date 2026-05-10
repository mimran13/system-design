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
exports.WithdrawMoneyUseCase = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const domain_errors_1 = require("../../domain/errors/domain.errors");
const transaction_entity_1 = require("../../domain/transaction.entity");
const bank_account_repository_interface_1 = require("../../domain/repositories/bank-account.repository.interface");
const transaction_repository_interface_1 = require("../../domain/repositories/transaction.repository.interface");
const account_id_vo_1 = require("../../domain/value-objects/account-id.vo");
const money_vo_1 = require("../../domain/value-objects/money.vo");
const with_optimistic_retry_1 = require("../utils/with-optimistic-retry");
let WithdrawMoneyUseCase = class WithdrawMoneyUseCase {
    accountRepo;
    transactionRepo;
    eventEmitter;
    constructor(accountRepo, transactionRepo, eventEmitter) {
        this.accountRepo = accountRepo;
        this.transactionRepo = transactionRepo;
        this.eventEmitter = eventEmitter;
    }
    async execute(command) {
        const accountId = account_id_vo_1.AccountId.of(command.accountId);
        const amount = money_vo_1.Money.of(command.amount, command.currency);
        return (0, with_optimistic_retry_1.withOptimisticRetry)(() => this.tryWithdraw(accountId, amount, command.description));
    }
    async tryWithdraw(accountId, amount, description) {
        const account = await this.accountRepo.findById(accountId);
        if (!account)
            throw new domain_errors_1.AccountNotFoundError(accountId.toString());
        account.withdraw(amount);
        await this.accountRepo.save(account);
        for (const event of account.pullDomainEvents()) {
            this.eventEmitter.emit(event.constructor.name, event);
        }
        const transaction = transaction_entity_1.Transaction.create({ accountId, type: 'WITHDRAWAL', amount, description });
        await this.transactionRepo.save(transaction);
        return {
            transactionId: transaction.id.toString(),
            newBalance: account.balance.amount,
            currency: account.balance.currency,
        };
    }
};
exports.WithdrawMoneyUseCase = WithdrawMoneyUseCase;
exports.WithdrawMoneyUseCase = WithdrawMoneyUseCase = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(bank_account_repository_interface_1.BANK_ACCOUNT_REPOSITORY)),
    __param(1, (0, common_1.Inject)(transaction_repository_interface_1.TRANSACTION_REPOSITORY)),
    __metadata("design:paramtypes", [bank_account_repository_interface_1.IBankAccountRepository,
        transaction_repository_interface_1.ITransactionRepository,
        event_emitter_1.EventEmitter2])
], WithdrawMoneyUseCase);
//# sourceMappingURL=withdraw-money.use-case.js.map