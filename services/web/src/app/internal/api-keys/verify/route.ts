import { type NextRequest, NextResponse } from 'next/server';
import { VerifyApiKeyRequest, VerifyApiKeyResponse } from '@gyde/contracts';
import { verifyApiKey } from '@/modules/api-keys/infrastructure/composition-root';
import { headers } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import pino from 'pino';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-internal-token"]',
  'headers.authorization',
  'headers["x-internal-token"]',
  'authorization',
  'apiKey',
  'password',
  'secret',
  'token',
  ...['authorization', 'apiKey', 'api_key', 'password', 'secret', 'token', 'accessToken'].flatMap(
    (key) => [`*.${key}`, `*.*.${key}`],
  ),
];

const logger = pino({
  name: 'api-key-verify',
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'api-key-verify' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
});

function verifyInternalToken(token: string | null): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected) {
    logger.error({ msg: 'INTERNAL_SERVICE_TOKEN not configured' });
    return false;
  }
  if (!token) {
    return false;
  }
  if (token.length !== expected.length) {
    return false;
  }
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(token), encoder.encode(expected));
}

export async function POST(request: NextRequest) {
  const headersList = await headers();
  const internalToken = headersList.get('x-internal-token');

  if (!verifyInternalToken(internalToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = VerifyApiKeyRequest.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await verifyApiKey.execute(parsed.data.apiKey);

    const response = VerifyApiKeyResponse.parse(result);
    return NextResponse.json(response);
  } catch (error) {
    logger.error({ msg: 'API key verification error', error: String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
