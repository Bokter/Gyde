import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { HEADERS } from '@gyde/contracts';
import { createLogger } from './logger';

const logger = createLogger('internal-auth');

/**
 * Constant-time check of the shared service token. Both sides are hashed first so the comparison
 * always runs over 32 bytes and the token length does not leak either. Without
 * INTERNAL_SERVICE_TOKEN configured every call is rejected (fail closed).
 */
export function isValidInternalToken(token: string | null | undefined): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected) {
    logger.error({ msg: 'INTERNAL_SERVICE_TOKEN is not configured: rejecting internal call' });
    return false;
  }
  if (!token) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(token), digest(expected));
}

/** For `/internal/*` handlers: a 401 response to return as-is, or `null` when the caller is trusted. */
export function rejectUnlessInternal(request: Request): NextResponse | null {
  if (isValidInternalToken(request.headers.get(HEADERS.internalToken))) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
