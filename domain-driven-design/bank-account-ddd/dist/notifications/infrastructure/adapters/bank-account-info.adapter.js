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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankAccountInfoAdapter = void 0;
const common_1 = require("@nestjs/common");
const get_account_balance_query_1 = require("../../../bank-account/application/queries/get-account-balance.query");
const account_info_port_1 = require("../../domain/ports/account-info.port");
let BankAccountInfoAdapter = class BankAccountInfoAdapter extends account_info_port_1.IAccountInfoPort {
    query;
    constructor(query) {
        super();
        this.query = query;
    }
    async getAccountInfo(accountId) {
        const result = await this.query.execute(accountId);
        if (!result)
            return null;
        return {
            accountId: result.accountId,
            balance: result.balance,
            currency: result.currency,
            isLocked: result.isLocked,
        };
    }
};
exports.BankAccountInfoAdapter = BankAccountInfoAdapter;
exports.BankAccountInfoAdapter = BankAccountInfoAdapter = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [get_account_balance_query_1.GetAccountBalanceQuery])
], BankAccountInfoAdapter);
//# sourceMappingURL=bank-account-info.adapter.js.map