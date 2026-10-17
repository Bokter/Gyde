import { HttpError } from '@gyde/service-kit';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, catchError, throwError } from 'rxjs';

import { InstanceNotFoundError, RegistryError } from '../application/errors';

/** Application error -> `HttpError` (same code, status and message as before the refactor). */
function toHttpError(error: RegistryError): HttpError {
  if (error instanceof InstanceNotFoundError) return new HttpError('not_found', error.message);
  return new HttpError('internal', 'Internal server error');
}

/**
 * Translates registry application errors into `HttpError`; the global filter of service-kit
 * (`ApiExceptionFilter`, not exported) still builds the `ApiError` envelope. An interceptor and
 * not an `@Catch` filter because a specific filter would replace that global one instead of
 * delegating to it.
 */
@Injectable()
export class ApplicationErrorInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          throwError(() => (error instanceof RegistryError ? toHttpError(error) : error)),
        ),
      );
  }
}
