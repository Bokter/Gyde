import { HttpError } from '@gyde/service-kit';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, catchError, throwError } from 'rxjs';

import {
  IngestionFailedError,
  IngestionInProgressError,
  NormalizationError,
  UnknownSourceError,
} from '../application/errors';

/** Application error -> `HttpError` (same code, status, message and details as before the refactor). */
function toHttpError(error: NormalizationError): HttpError {
  if (error instanceof UnknownSourceError) return new HttpError('not_found', error.message);
  if (error instanceof IngestionInProgressError) return new HttpError('conflict', error.message);
  if (error instanceof IngestionFailedError) {
    return new HttpError('upstream_unavailable', error.message, { source: error.source });
  }
  return new HttpError('internal', 'Internal server error');
}

/**
 * Translates normalization application errors into `HttpError`; the global filter of service-kit
 * still builds the `ApiError` envelope. An interceptor and not an `@Catch` filter because a
 * specific filter would replace that global one instead of delegating to it. Anything that is not
 * a `NormalizationError` (for example a validation error from the pipe) passes through untouched.
 */
@Injectable()
export class ApplicationErrorInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          throwError(() => (error instanceof NormalizationError ? toHttpError(error) : error)),
        ),
      );
  }
}
