import { type ErrorCode, HTTP_STATUS_BY_CODE } from '@gyde/contracts';

/**
 * Throw this from any handler or use case adapter: the error handler installed by `buildApp`
 * turns it into the standard `ApiError` envelope with the right HTTP status.
 */
export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.status = HTTP_STATUS_BY_CODE[code];
    this.details = details;
  }
}
