import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  AccountNotFoundError,
  ConcurrencyError,
  DomainError,
  InsufficientFundsError,
  InvalidAmountError,
} from './domain/domain-error';

/**
 * Translates domain errors into HTTP responses at the very edge of the app.
 *
 * The domain throws meaningful, HTTP-ignorant errors; this one place decides
 * that "not found" is a 404, a broken invariant is a 422, and a lost race is a
 * 409. If you ever put this app behind gRPC or a queue instead of HTTP, this is
 * the only file that changes — the domain doesn't move an inch.
 */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = this.statusFor(error);
    response.status(status).json({
      statusCode: status,
      error: error.name,
      message: error.message,
    });
  }

  private statusFor(error: DomainError): number {
    if (error instanceof AccountNotFoundError) return HttpStatus.NOT_FOUND;
    if (error instanceof ConcurrencyError) return HttpStatus.CONFLICT;
    if (error instanceof InsufficientFundsError) return HttpStatus.UNPROCESSABLE_ENTITY;
    if (error instanceof InvalidAmountError) return HttpStatus.BAD_REQUEST;
    return HttpStatus.BAD_REQUEST;
  }
}
