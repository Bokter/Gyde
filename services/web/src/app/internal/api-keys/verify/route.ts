import { type NextRequest, NextResponse } from 'next/server';
import { VerifyApiKeyRequest, VerifyApiKeyResponse } from '@gyde/contracts';
import { verifyApiKey } from '@/modules/api-keys/infrastructure/composition-root';
import { rejectUnlessInternal } from '@/lib/internal-auth';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api-key-verify');

export async function POST(request: NextRequest) {
  const unauthorized = rejectUnlessInternal(request);
  if (unauthorized) return unauthorized;

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
