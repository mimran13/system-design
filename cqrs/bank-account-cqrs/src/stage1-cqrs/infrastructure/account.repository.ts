import { Injectable } from '@nestjs/common';
import { Money } from '../../shared/domain/money';
import { Account } from '../domain/account';

/**
 * The WRITE-side repository. It persists and rehydrates the Account write model.
 *
 * We depend on the ABSTRACT class, not the in-memory implementation below. That's
 * the "swappable seam": every command handler asks for `AccountRepository`, and
 * the module decides at wiring time which concrete class to hand over. Today it's
 * in-memory; swapping to Postgres/Mongo means writing one new class and changing
 * one line in cqrs.module.ts — no handler changes.
 */
export abstract class AccountRepository {
  abstract save(account: Account): Promise<void>;
  abstract findById(id: string): Promise<Account | null>;
}

@Injectable()
export class InMemoryAccountRepository extends AccountRepository {
  // We store the STATE (a plain row), not the rich object. Rebuilding the rich
  // Account on read is exactly what a real ORM does under the hood.
  private readonly rows = new Map<string, { owner: string; balanceMinor: number }>();

  async save(account: Account): Promise<void> {
    this.rows.set(account.id, {
      owner: account.owner,
      balanceMinor: account.getBalance().toMinor(),
    });
  }

  async findById(id: string): Promise<Account | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    return Account.rehydrate(id, row.owner, Money.fromMinor(row.balanceMinor));
  }
}
