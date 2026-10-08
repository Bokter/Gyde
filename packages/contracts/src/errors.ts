import { z } from 'zod';

export const ErrorCode = z.enum([
  'invalid_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'plan_limit_exceeded',
  'upstream_unavailable',
  'not_implemented',
  'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Error envelope returned by every HTTP service. Never include secrets or stack traces. */
export const ApiError = z.strictObject({
  error: z.strictObject({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  plan_limit_exceeded: 402,
  upstream_unavailable: 503,
  not_implemented: 501,
  internal: 500,
};
