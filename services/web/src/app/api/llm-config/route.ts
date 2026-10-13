import { NextResponse, type NextRequest } from 'next/server';
import { LlmProviderConfigInput } from '@gyde/contracts';
import { auth } from '@/modules/auth/infrastructure/auth.config';
import {
  LlmConnectionTestError,
  UnsupportedLlmProviderError,
} from '@/modules/llm-config/domain/errors';
import { llmConfigModule } from '@/modules/llm-config/infrastructure/composition-root';
import { createLogger } from '@/lib/logger';

const logger = createLogger('llm-config');

/** Dashboard routes for the studio's LLM key. Responses carry `LlmProviderConfigView` only. */
async function currentTenantId(): Promise<string | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = await llmConfigModule().tenantIdForUser(session.user.id);
  if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return tenantId;
}

function serverError(operation: string, error: unknown) {
  // Only the error class: a message could, in theory, echo provider output.
  logger.error({ msg: `${operation} failed`, errorName: (error as Error)?.name ?? 'unknown' });
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET() {
  const tenantId = await currentTenantId();
  if (tenantId instanceof NextResponse) return tenantId;
  try {
    return NextResponse.json({ config: await llmConfigModule().view.execute(tenantId) });
  } catch (error) {
    return serverError('Read LLM config', error);
  }
}

export async function PUT(request: NextRequest) {
  const tenantId = await currentTenantId();
  if (tenantId instanceof NextResponse) return tenantId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 });
  }
  const parsed = LlmProviderConfigInput.safeParse(body);
  if (!parsed.success) {
    // Paths and codes only: zod issues can include the received value, i.e. the key.
    const issues = parsed.error.issues.map(({ path, code }) => ({ path, code }));
    return NextResponse.json({ error: 'invalid-body', issues }, { status: 400 });
  }

  try {
    const config = await llmConfigModule().save.execute(tenantId, parsed.data);
    return NextResponse.json({ config });
  } catch (error) {
    if (error instanceof UnsupportedLlmProviderError) {
      return NextResponse.json({ error: 'unsupported-provider' }, { status: 400 });
    }
    if (error instanceof LlmConnectionTestError) {
      return NextResponse.json(
        { error: 'connection-test-failed', reason: error.reason },
        { status: 422 },
      );
    }
    return serverError('Save LLM config', error);
  }
}

export async function DELETE() {
  const tenantId = await currentTenantId();
  if (tenantId instanceof NextResponse) return tenantId;
  try {
    const revoked = await llmConfigModule().revoke.execute(tenantId);
    return revoked
      ? NextResponse.json({ revoked: true })
      : NextResponse.json({ error: 'not-found' }, { status: 404 });
  } catch (error) {
    return serverError('Revoke LLM config', error);
  }
}
