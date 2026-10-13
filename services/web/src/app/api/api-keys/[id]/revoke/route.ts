import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/modules/auth/infrastructure/auth.config';
import { revokeApiKey } from '@/modules/api-keys/infrastructure/composition-root';
import { listApiKeys } from '@/modules/api-keys/infrastructure/composition-root';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api-keys');

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenant = await listApiKeys.getTenantByOwnerId(session.user.id);
  if (!tenant) {
    return NextResponse.json({ error: 'Forbidden: no tenant found for user' }, { status: 403 });
  }

  const { id } = await params;

  try {
    await revokeApiKey.execute(id, tenant.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ msg: 'Revoke API key error', error: String(error) });
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND') {
        return NextResponse.json({ error: 'API key not found' }, { status: 404 });
      }
      if (error.message === 'ALREADY_REVOKED') {
        return NextResponse.json({ error: 'API key already revoked' }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
