import { type NextRequest, NextResponse } from 'next/server';
import { VerifyApiKeyRequest, VerifyApiKeyResponse } from '@gyde/contracts';
import { verifyApiKey } from '@/modules/api-keys/infrastructure/composition-root';
import { headers } from 'next/headers';

const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

export async function POST(request: NextRequest) {
  // Verify internal token
  const headersList = await headers();
  const internalToken = headersList.get('x-internal-token');

  if (!internalToken || internalToken !== INTERNAL_TOKEN) {
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
    console.error('API key verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
