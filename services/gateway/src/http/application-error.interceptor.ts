import { HttpError } from '@gyde/service-kit';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, catchError, throwError } from 'rxjs';

import { GatewayError, PlanLimitExceededError, UnauthorizedError } from '../application/errors';

/**
 * Application error -> `HttpError` (same code, status and message as before the refactor). Errors
 * that are not gateway application errors (an `HttpError` from an adapter, for one) pass untouched.
 */
export function translateApplicationError(error: unknown): unknown {
  if (!(error instanceof GatewayError)) return error;
  if (error instanceof UnauthorizedError) return new HttpError('unauthorized', error.message);
  if (error instanceof PlanLimitExceededError) {
    return new HttpError('plan_limit_exceeded', error.message);
  }
  return new HttpError('internal', 'Internal server error');
}

/**
 * Translates gateway application errors raised by the route handlers; the global filter of
 * service-kit (`ApiExceptionFilter`, not exported) still builds the `ApiError` envelope. An
 * interceptor and not an `@Catch` filter because a specific filter would replace that global one.
 * Guards run before interceptors, so `ApiKeyGuard` applies `translateApplicationError` itself.
 */
@Injectable()
export class ApplicationErrorInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(catchError((error: unknown) => throwError(() => translateApplicationError(error))));
  }
}
