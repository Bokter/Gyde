import { NextResponse, type NextRequest } from 'next/server';
import { InternalLlmConfig } from '@gyde/contracts';
import { rejectUnlessInternal } from '@/lib/internal-auth';
import { createLogger } from '@/lib/logger';
import { llmConfigModule } from '@/modules/llm-config/infrastructure/composition-root';

const logger = createLogger('internal-llm-config');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { 'cache-control': 'no-store' };

/**
 * `GET /internal/tenants/:tenantId/llm-config` (ROUTES.web.tenantLlmConfig), for llm-analysis
 * only. Answers the DECRYPTED key: the body is never logged, and 404 means "no key configured".
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const unauthorized = rejectUnlessInternal(request);
  if (unauthorized) return unauthorized;

  const { tenantId } = await params;
  if (!UUID.test(tenantId)) {
    return NextResponse.json({ error: 'not-found' }, { status: 404, headers: NO_STORE });
  }

  try {
    const config = await llmConfigModule().internal.execute(tenantId);
    if (!config) {
      return NextResponse.json({ error: 'not-found' }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json(InternalLlmConfig.parse(config), { headers: NO_STORE });
  } catch (error) {
    logger.error({
      msg: 'Internal LLM config failed',
      tenantId,
      errorName: (error as Error)?.name ?? 'unknown',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE },
    );
  }
}
