import type { z } from 'zod';

import { HttpError } from './errors';

/** Parses untrusted input with a contract schema; throws a 400 `HttpError` when it does not fit. */
export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError('invalid_request', 'Request validation failed', toDetails(result.error));
  }
  return result.data;
}

export function toDetails(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}
