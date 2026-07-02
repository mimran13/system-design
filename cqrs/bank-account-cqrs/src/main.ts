import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { DomainErrorFilter } from './shared/domain-error.filter';

/**
 * Application entry point.
 *
 * There is nothing CQRS-specific here — this is a bog-standard NestJS bootstrap.
 * The interesting stuff lives in the two feature modules:
 *   - /stage1/...  the pure-CQRS bank          (src/stage1-cqrs)
 *   - /stage2/...  the event-sourced bank + saga (src/stage2-event-sourcing)
 *
 * For the guided tour, open ../cqrs-guide.html in a browser alongside this code.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // DTO validation at the edge — commands should never carry junk into the domain.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // One place turns domain errors into HTTP status codes.
  app.useGlobalFilters(new DomainErrorFilter());

  await app.listen(3000);
  new Logger('Bootstrap').log('Bank is open at http://localhost:3000');
}

bootstrap();
