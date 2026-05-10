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
exports.GetTransactionsUseCase = void 0;
const common_1 = require("@nestjs/common");
const domain_errors_1 = require("../../domain/errors/domain.errors");
const bank_account_repository_interface_1 = require("../../domain/repositories/bank-account.repository.interface");
const transaction_repository_interface_1 = require("../../domain/repositories/transaction.repository.interface");
const account_id_vo_1 = require("../../domain/value-objects/account-id.vo");
let GetTransactionsUseCase = class GetTransactionsUseCase {
    accountRepo;
    transactionRepo;
    constructor(accountRepo, transactionRepo) {
        this.accountRepo = accountRepo;
        this.transactionRepo = transactionRepo;
    }
    async execute(query) {
        const accountId = account_id_vo_1.AccountId.of(query.accountId);
        const account = await this.accountRepo.findById(accountId);
        if (!account) {
            throw new domain_errors_1.AccountNotFoundError(accountId.toString());
        }
        const transactions = await this.transactionRepo.findByAccountId(accountId, query.limit ?? 20, query.offset ?? 0);
        return {
            accountId: account.id.toString(),
            currentBalance: account.balance.amount,
            currency: account.balance.currency,
            transactions: transactions.map((t) => ({
                id: t.id.toString(),
                type: t.type,
                amount: t.amount.amount,
                currency: t.amount.currency,
                description: t.description,
                createdAt: t.createdAt,
            })),
        };
    }
};
exports.GetTransactionsUseCase = GetTransactionsUseCase;
exports.GetTransactionsUseCase = GetTransactionsUseCase = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(bank_account_repository_interface_1.BANK_ACCOUNT_REPOSITORY)),
    __param(1, (0, common_1.Inject)(transaction_repository_interface_1.TRANSACTION_REPOSITORY)),
    __metadata("design:paramtypes", [bank_account_repository_interface_1.IBankAccountRepository,
        transaction_repository_interface_1.ITransactionRepository])
], GetTransactionsUseCase);
//# sourceMappingURL=get-transactions.use-case.js.map