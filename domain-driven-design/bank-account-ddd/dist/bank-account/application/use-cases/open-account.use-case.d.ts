import { EventEmitter2 } from '@nestjs/event-emitter';
import { IBankAccountRepository } from '../../domain/repositories/bank-account.repository.interface';
export interface OpenAccountCommand {
    currency?: string;
}
export interface OpenAccountResult {
    accountId: string;
    balance: number;
    currency: string;
}
export declare class OpenAccountUseCase {
    private readonly accountRepo;
    private readonly eventEmitter;
    constructor(accountRepo: IBankAccountRepository, eventEmitter: EventEmitter2);
    execute(command: OpenAccountCommand): Promise<OpenAccountResult>;
}
