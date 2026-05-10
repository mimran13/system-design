import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountLockedEvent, AccountOpenedEvent, AccountUnlockedEvent, MoneyDepositedEvent, MoneyWithdrawnEvent } from '../../domain/events/domain-events';
export declare class IntegrationEventPublisher {
    private readonly eventEmitter;
    constructor(eventEmitter: EventEmitter2);
    onAccountOpened(event: AccountOpenedEvent): void;
    onMoneyDeposited(event: MoneyDepositedEvent): void;
    onMoneyWithdrawn(event: MoneyWithdrawnEvent): void;
    onAccountLocked(event: AccountLockedEvent): void;
    onAccountUnlocked(event: AccountUnlockedEvent): void;
}
