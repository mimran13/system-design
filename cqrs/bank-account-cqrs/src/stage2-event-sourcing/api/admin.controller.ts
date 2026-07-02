import { Controller, Post } from '@nestjs/common';
import { ProjectionRebuilder } from '../projections/projection-rebuilder';

/**
 * Admin endpoint that demonstrates the headline event-sourcing capability:
 * blow away the read model and rebuild it from the event log.
 *
 * Suggested demo:
 *   1. Open an account, deposit, withdraw a few times.
 *   2. GET the account — note the balance.
 *   3. POST /stage2/admin/rebuild-projections.
 *   4. GET the account again — identical balance, reconstructed purely by
 *      replaying events. The read model was disposable all along.
 */
@Controller('stage2/admin')
export class Stage2AdminController {
  constructor(private readonly rebuilder: ProjectionRebuilder) {}

  @Post('rebuild-projections')
  async rebuild() {
    return this.rebuilder.rebuild();
  }
}
