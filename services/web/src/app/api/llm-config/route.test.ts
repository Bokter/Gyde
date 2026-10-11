import { NextRequest } from 'next/server';
import type * as LoggerModule from '@/lib/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmConnectionTester } from '@/modules/llm-config/application/ports/llm-connection-tester';
import { buildLlmConfigModule } from '../../../../test/support/llm-config';

const state = vi.hoisted(() => {
  const lines: string[] = [];
  // Stable pino destination: route modules create their loggers at import time.
  const destination = { write: (line: string) => void lines.push(line) };
  return { module: undefined as unknown, lines, destination, logs: () => lines.join('') };
});

vi.mock('@/modules/auth/infrastructure/auth.config', () => ({
  auth: async () => ({ user: { id: 'user-1' } }),
}));
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

const { GET, PUT } = await import('./route');

const TENANT = '22222222-2222-4222-8222-222222222222';
const STUDIO_KEY = 'sk-ant-api03-SENTINEL-studio-key-0123456789';

function put(body: unknown) {
  return PUT(
    new NextRequest('http://web/api/llm-config', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  );
}

const validBody = { provider: 'anthropic', model: 'claude-opus-5-5', apiKey: STUDIO_KEY };

function useTester(tester: LlmConnectionTester) {
  state.module = buildLlmConfigModule(tester, async () => TENANT).module;
}

describe('/api/llm-config never leaks the studio key', () => {
  beforeEach(() => {
    state.lines.length = 0;
  });

  it('not in the response nor the logs when the connection test fails', async () => {
    useTester({ test: async () => ({ ok: false, reason: 'invalid-key' }) });

    const response = await put(validBody);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'connection-test-failed',
      reason: 'invalid-key',
    });
    expect(state.logs()).not.toContain(STUDIO_KEY);
  });

  it('not in the response nor the logs when the provider fails with the key in its error', async () => {
    useTester({
      test: async ({ apiKey }) => {
        throw new Error(`provider echoed ${apiKey}`);
      },
    });

    const response = await put(validBody);

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(STUDIO_KEY);
    expect(state.logs()).toContain('Save LLM config failed');
    expect(state.logs()).not.toContain(STUDIO_KEY);
  });

  it('not in validation errors', async () => {
    useTester({ test: async () => ({ ok: true }) });

    const response = await put({ ...validBody, apiKey: `${STUDIO_KEY}${'x'.repeat(500)}` });

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(STUDIO_KEY);
  });

  it('not in the view after saving: only provider, model and the last 4 characters', async () => {
    useTester({ test: async () => ({ ok: true }) });

    const saved = await put(validBody);
    const read = await GET();

    expect(saved.status).toBe(200);
    for (const body of [await saved.text(), await read.text()]) {
      expect(body).not.toContain(STUDIO_KEY);
      expect(JSON.parse(body).config).toMatchObject({
        provider: 'anthropic',
        model: 'claude-opus-5-5',
        keyLast4: STUDIO_KEY.slice(-4),
        status: 'active',
      });
    }
    expect(state.logs()).not.toContain(STUDIO_KEY);
  });

  it('rejects providers llm-analysis cannot use, before testing anything', async () => {
    const test = vi.fn(async () => ({ ok: true as const }));
    useTester({ test });

    const response = await put({ ...validBody, provider: 'openai' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'unsupported-provider' });
    expect(test).not.toHaveBeenCalled();
  });
});
