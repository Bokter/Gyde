import { InternalLlmConfig, HEADERS } from '@gyde/contracts';
import { NextRequest } from 'next/server';
import type * as LoggerModule from '@/lib/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLlmConfigModule } from '../../../../../../test/support/llm-config';

const state = vi.hoisted(() => {
  const lines: string[] = [];
  // Stable pino destination: route modules create their loggers at import time.
  const destination = { write: (line: string) => void lines.push(line) };
  return { module: undefined as unknown, lines, destination, logs: () => lines.join('') };
});

vi.mock('@/modules/llm-config/infrastructure/composition-root', () => ({
  llmConfigModule: () => state.module,
}));
vi.mock('@/lib/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof LoggerModule>();
  return {
    ...actual,
    createLogger: (name: string) => actual.createLogger(name, state.destination),
  };
});

const { GET } = await import('./route');

const TOKEN = 'internal-token-for-tests-0123456789';
const TENANT = '22222222-2222-4222-8222-222222222222';
const STUDIO_KEY = 'sk-ant-api03-SENTINEL-studio-key-0123456789';

function call(tenantId: string, token?: string) {
  const headers = token ? { [HEADERS.internalToken]: token } : undefined;
  const request = new NextRequest(`http://web/internal/tenants/${tenantId}/llm-config`, {
    headers,
  });
  return GET(request, { params: Promise.resolve({ tenantId }) });
}

describe('GET /internal/tenants/:tenantId/llm-config', () => {
  let built: ReturnType<typeof buildLlmConfigModule>;

  beforeEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN = TOKEN;
    state.lines.length = 0;
    built = buildLlmConfigModule({ test: async () => ({ ok: true }) });
    state.module = built.module;
  });

  afterEach(() => {
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('answers 401 without the internal token or with a wrong one', async () => {
    await built.module.save.execute(TENANT, {
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      apiKey: STUDIO_KEY,
    });

    for (const response of [await call(TENANT), await call(TENANT, `${TOKEN}x`)]) {
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain(STUDIO_KEY);
    }
  });

  it('answers 401 when INTERNAL_SERVICE_TOKEN is not configured, even with a token', async () => {
    delete process.env.INTERNAL_SERVICE_TOKEN;

    expect((await call(TENANT, TOKEN)).status).toBe(401);
  });

  it('answers 404 when the tenant has no key (or the id is not a tenant id)', async () => {
    expect((await call(TENANT, TOKEN)).status).toBe(404);
    expect((await call('not-a-uuid', TOKEN)).status).toBe(404);
  });

  it('answers the decrypted InternalLlmConfig, uncached and without logging it', async () => {
    await built.module.save.execute(TENANT, {
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      apiKey: STUDIO_KEY,
    });

    const response = await call(TENANT, TOKEN);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(InternalLlmConfig.parse(await response.json())).toEqual({
      tenantId: TENANT,
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      apiKey: STUDIO_KEY,
    });
    expect(state.logs()).not.toContain(STUDIO_KEY);
  });

  it('answers 404 again once the studio revokes its key', async () => {
    await built.module.save.execute(TENANT, {
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      apiKey: STUDIO_KEY,
    });
    await built.module.revoke.execute(TENANT);

    expect((await call(TENANT, TOKEN)).status).toBe(404);
  });
});
