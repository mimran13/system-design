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
exports.BankAccountController = void 0;
const common_1 = require("@nestjs/common");
const domain_errors_1 = require("../domain/errors/domain.errors");
const deposit_money_use_case_1 = require("../application/use-cases/deposit-money.use-case");
const get_transactions_use_case_1 = require("../application/use-cases/get-transactions.use-case");
const open_account_use_case_1 = require("../application/use-cases/open-account.use-case");
const withdraw_money_use_case_1 = require("../application/use-cases/withdraw-money.use-case");
let BankAccountController = class BankAccountController {
    openAccountUseCase;
    depositMoneyUseCase;
    withdrawMoneyUseCase;
    getTransactionsUseCase;
    constructor(openAccountUseCase, depositMoneyUseCase, withdrawMoneyUseCase, getTransactionsUseCase) {
        this.openAccountUseCase = openAccountUseCase;
        this.depositMoneyUseCase = depositMoneyUseCase;
        this.withdrawMoneyUseCase = withdrawMoneyUseCase;
        this.getTransactionsUseCase = getTransactionsUseCase;
    }
    async openAccount(body) {
        const result = await this.openAccountUseCase.execute({
            currency: body.currency,
        });
        return {
            accountId: result.accountId,
            balance: result.balance,
            currency: result.currency,
            message: 'Account opened successfully',
        };
    }
    async deposit(accountId, body) {
        try {
            const result = await this.depositMoneyUseCase.execute({
                accountId,
                amount: body.amount,
                currency: body.currency,
                description: body.description,
            });
            return {
                transactionId: result.transactionId,
                newBalance: result.newBalance,
                currency: result.currency,
            };
        }
        catch (error) {
            this.mapDomainError(error);
        }
    }
    async withdraw(accountId, body) {
        try {
            const result = await this.withdrawMoneyUseCase.execute({
                accountId,
                amount: body.amount,
                currency: body.currency,
                description: body.description,
            });
            return {
                transactionId: result.transactionId,
                newBalance: result.newBalance,
                currency: result.currency,
            };
        }
        catch (error) {
            this.mapDomainError(error);
        }
    }
    async getTransactions(accountId, limit, offset) {
        try {
            return await this.getTransactionsUseCase.execute({
                accountId,
                limit: limit ? parseInt(limit) : 20,
                offset: offset ? parseInt(offset) : 0,
            });
        }
        catch (error) {
            this.mapDomainError(error);
        }
    }
    mapDomainError(error) {
        if (error instanceof domain_errors_1.AccountNotFoundError) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.NOT_FOUND);
        }
        if (error instanceof domain_errors_1.InsufficientFundsError) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
        }
        if (error instanceof domain_errors_1.AccountLockedError) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.FORBIDDEN);
        }
        if (error instanceof domain_errors_1.ConcurrentModificationError) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.CONFLICT);
        }
        throw error;
    }
};
exports.BankAccountController = BankAccountController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BankAccountController.prototype, "openAccount", null);
__decorate([
    (0, common_1.Post)(':id/deposit'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BankAccountController.prototype, "deposit", null);
__decorate([
    (0, common_1.Post)(':id/withdraw'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BankAccountController.prototype, "withdraw", null);
__decorate([
    (0, common_1.Get)(':id/transactions'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], BankAccountController.prototype, "getTransactions", null);
exports.BankAccountController = BankAccountController = __decorate([
    (0, common_1.Controller)('accounts'),
    __metadata("design:paramtypes", [open_account_use_case_1.OpenAccountUseCase,
        deposit_money_use_case_1.DepositMoneyUseCase,
        withdraw_money_use_case_1.WithdrawMoneyUseCase,
        get_transactions_use_case_1.GetTransactionsUseCase])
], BankAccountController);
//# sourceMappingURL=bank-account.controller.js.map