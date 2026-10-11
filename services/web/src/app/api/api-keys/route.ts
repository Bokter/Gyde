import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/modules/auth/infrastructure/auth.config';
import { createApiKey } from '@/modules/api-keys/infrastructure/composition-root';
import { z } from 'zod';
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

const createApiKeySchema = z.object({
  name: z.string().max(100).optional().nullable(),
  environment: z.enum(['live', 'test']).default('live'),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // TODO: Get tenant ID from user session
  return NextResponse.json({ apiKeys: [] });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createApiKeySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // TODO: Get tenant ID from user session
    const tenantId = 'placeholder-tenant-id';

    const result = await createApiKey.execute({
      tenantId,
      name: parsed.data.name ?? null,
      environment: parsed.data.environment,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    });

    return NextResponse.json(
      {
        id: result.apiKey.id,
        prefix: result.apiKey.prefix,
        keyLast4: result.apiKey.keyLast4,
        name: result.apiKey.name,
        environment: result.apiKey.environment,
        expiresAt: result.apiKey.expiresAt?.toISOString() ?? null,
        createdAt: result.apiKey.createdAt.toISOString(),
        plainKey: result.plainKey, // Only returned once!
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error({ msg: 'Create API key error', error: String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
