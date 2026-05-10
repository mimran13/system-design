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
exports.GetAccountBalanceQuery = void 0;
const common_1 = require("@nestjs/common");
const bank_account_repository_interface_1 = require("../../domain/repositories/bank-account.repository.interface");
const account_id_vo_1 = require("../../domain/value-objects/account-id.vo");
let GetAccountBalanceQuery = class GetAccountBalanceQuery {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async execute(accountId) {
        const account = await this.repo.findById(account_id_vo_1.AccountId.of(accountId));
        if (!account)
            return null;
        return {
            accountId: account.id.toString(),
            balance: account.balance.amount,
            currency: account.balance.currency,
            isLocked: account.isLocked,
        };
    }
};
exports.GetAccountBalanceQuery = GetAccountBalanceQuery;
exports.GetAccountBalanceQuery = GetAccountBalanceQuery = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(bank_account_repository_interface_1.BANK_ACCOUNT_REPOSITORY)),
    __metadata("design:paramtypes", [bank_account_repository_interface_1.IBankAccountRepository])
], GetAccountBalanceQuery);
//# sourceMappingURL=get-account-balance.query.js.map