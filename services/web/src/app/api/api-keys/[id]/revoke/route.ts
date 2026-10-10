import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/modules/auth/infrastructure/auth.config';
import { revokeApiKey } from '@/modules/api-keys/infrastructure/composition-root';

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
    console.error('Revoke API key error:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
