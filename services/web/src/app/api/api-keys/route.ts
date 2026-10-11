import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/modules/auth/infrastructure/auth.config';
import { createApiKey, listApiKeys } from '@/modules/api-keys/infrastructure/composition-root';
import { toApiKeyView } from '@/modules/api-keys/application/api-key-view';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api-keys');

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

  const tenant = await listApiKeys.getTenantByOwnerId(session.user.id);
  if (!tenant) {
    return NextResponse.json({ error: 'Forbidden: no tenant found for user' }, { status: 403 });
  }

  const apiKeys = await listApiKeys.execute(tenant.id);

  const now = new Date();
  return NextResponse.json({ apiKeys: apiKeys.map((k) => toApiKeyView(k, now)) });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenant = await listApiKeys.getTenantByOwnerId(session.user.id);
  if (!tenant) {
    return NextResponse.json({ error: 'Forbidden: no tenant found for user' }, { status: 403 });
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

    const result = await createApiKey.execute({
      tenantId: tenant.id,
      name: parsed.data.name ?? null,
      environment: parsed.data.environment,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    });

    return NextResponse.json(
      { ...toApiKeyView(result.apiKey), plainKey: result.plainKey },
      { status: 201 },
    );
  } catch (error) {
    logger.error({ msg: 'Create API key error', error: String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
