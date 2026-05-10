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
exports.IntegrationEventPublisher = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const domain_events_1 = require("../../domain/events/domain-events");
let IntegrationEventPublisher = class IntegrationEventPublisher {
    eventEmitter;
    constructor(eventEmitter) {
        this.eventEmitter = eventEmitter;
    }
    onAccountOpened(event) {
        this.eventEmitter.emit('bank-account.account.opened', {
            accountId: event.accountId,
            currency: event.currency,
            occurredAt: event.occurredAt.toISOString(),
        });
    }
    onMoneyDeposited(event) {
        this.eventEmitter.emit('bank-account.money.deposited', {
            accountId: event.accountId,
            amount: event.amount,
            currency: event.currency,
            newBalance: event.newBalance,
            occurredAt: event.occurredAt.toISOString(),
        });
    }
    onMoneyWithdrawn(event) {
        this.eventEmitter.emit('bank-account.money.withdrawn', {
            accountId: event.accountId,
            amount: event.amount,
            currency: event.currency,
            newBalance: event.newBalance,
            occurredAt: event.occurredAt.toISOString(),
        });
    }
    onAccountLocked(event) {
        this.eventEmitter.emit('bank-account.account.locked', {
            accountId: event.accountId,
            occurredAt: event.occurredAt.toISOString(),
        });
    }
    onAccountUnlocked(event) {
        this.eventEmitter.emit('bank-account.account.unlocked', {
            accountId: event.accountId,
            occurredAt: event.occurredAt.toISOString(),
        });
    }
};
exports.IntegrationEventPublisher = IntegrationEventPublisher;
__decorate([
    (0, event_emitter_1.OnEvent)(domain_events_1.AccountOpenedEvent.name),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [domain_events_1.AccountOpenedEvent]),
    __metadata("design:returntype", void 0)
], IntegrationEventPublisher.prototype, "onAccountOpened", null);
__decorate([
    (0, event_emitter_1.OnEvent)(domain_events_1.MoneyDepositedEvent.name),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [domain_events_1.MoneyDepositedEvent]),
    __metadata("design:returntype", void 0)
], IntegrationEventPublisher.prototype, "onMoneyDeposited", null);
__decorate([
    (0, event_emitter_1.OnEvent)(domain_events_1.MoneyWithdrawnEvent.name),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [domain_events_1.MoneyWithdrawnEvent]),
    __metadata("design:returntype", void 0)
], IntegrationEventPublisher.prototype, "onMoneyWithdrawn", null);
__decorate([
    (0, event_emitter_1.OnEvent)(domain_events_1.AccountLockedEvent.name),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [domain_events_1.AccountLockedEvent]),
    __metadata("design:returntype", void 0)
], IntegrationEventPublisher.prototype, "onAccountLocked", null);
__decorate([
    (0, event_emitter_1.OnEvent)(domain_events_1.AccountUnlockedEvent.name),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [domain_events_1.AccountUnlockedEvent]),
    __metadata("design:returntype", void 0)
], IntegrationEventPublisher.prototype, "onAccountUnlocked", null);
exports.IntegrationEventPublisher = IntegrationEventPublisher = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [event_emitter_1.EventEmitter2])
], IntegrationEventPublisher);
//# sourceMappingURL=integration-event-publisher.js.map