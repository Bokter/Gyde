import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/modules/auth/infrastructure/auth.config';
import { revokeApiKey } from '@/modules/api-keys/infrastructure/composition-root';
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
  name: 'api-keys',
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'api-keys' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // TODO: Get tenant ID from user session
    const tenantId = 'placeholder-tenant-id';

    await revokeApiKey.execute(id, tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ msg: 'Revoke API key error', error: String(error) });
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
