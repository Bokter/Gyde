import type { LlmProviderConfigInput } from '@gyde/contracts';
import { describe, expect, it } from 'vitest';
import type { LlmConnectionTester } from '../application/ports/llm-connection-tester';
import { GeminiConnectionTester } from './gemini-connection-tester';
import { OfflineConnectionTester } from './offline-connection-tester';
import { ProviderConnectionTester } from './provider-connection-tester';

const GEMINI_KEY = 'AIzaSyTest-key_0123456789abcdefghijk';
const ANTHROPIC_KEY = 'sk-ant-api03-studio-secret-0123456789abcdef';
const gemini = (over: Partial<LlmProviderConfigInput> = {}): LlmProviderConfigInput => ({
  provider: 'gemini',
  model: 'gemini-test-flash',
  apiKey: GEMINI_KEY,
  ...over,
});

/** A Gemini API that records the requests and answers with `status`. */
function fakeGemini(status: number) {
  const calls: { url: string; headers: Headers }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), headers: new Headers(init.headers) });
    return new Response(`provider text with ${GEMINI_KEY}`, { status });
  }) as typeof fetch;
  return {
    calls,
    tester: new GeminiConnectionTester({ fetch: fetchImpl, baseUrl: 'https://gemini.test' }),
  };
}

describe('GeminiConnectionTester', () => {
  it('checks the model with the key in a header, never in the URL, and spends no tokens', async () => {
    const { calls, tester } = fakeGemini(200);

    expect(await tester.test(gemini())).toEqual({ ok: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://gemini.test/v1beta/models/gemini-test-flash');
    expect(calls[0]?.url).not.toContain(GEMINI_KEY);
    expect(calls[0]?.headers.get('x-goog-api-key')).toBe(GEMINI_KEY);
  });

  it.each([
    [400, 'invalid-key'],
    [401, 'invalid-key'],
    [403, 'invalid-key'],
    [404, 'model-not-found'],
    [500, 'unreachable'],
    [429, 'unreachable'],
  ])(
    'answers %s with the fixed reason %s, without echoing the provider text',
    async (status, reason) => {
      const { tester } = fakeGemini(status);

      const result = await tester.test(gemini());

      expect(result).toEqual({ ok: false, reason });
      expect(JSON.stringify(result)).not.toContain(GEMINI_KEY);
    },
  );

  it('is unreachable when the network fails, and refuses a model name that could change the path', async () => {
    const down = new GeminiConnectionTester({
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    expect(await down.test(gemini())).toEqual({ ok: false, reason: 'unreachable' });

    const { calls, tester } = fakeGemini(200);
    for (const model of ['../x', 'gemini x', 'a/b', '']) {
      expect(await tester.test(gemini({ model }))).toEqual({
        ok: false,
        reason: 'model-not-found',
      });
    }
    expect(calls).toHaveLength(0);
  });
});

describe('ProviderConnectionTester', () => {
  it('tests each key with the tester of its own provider, never with the other one', async () => {
    const seen: string[] = [];
    const stub = (name: string): LlmConnectionTester => ({
      test: async ({ apiKey }) => {
        seen.push(`${name}:${apiKey.slice(0, 4)}`);
        return { ok: true };
      },
    });
    const tester = new ProviderConnectionTester({
      anthropic: stub('anthropic'),
      gemini: stub('gemini'),
    });

    await tester.test(gemini());
    await tester.test({ provider: 'anthropic', model: 'claude-opus-5-5', apiKey: ANTHROPIC_KEY });

    expect(seen).toEqual(['gemini:AIza', 'anthropic:sk-a']);
  });

  it('sends a provider without a tester nowhere', async () => {
    const tester = new ProviderConnectionTester({
      anthropic: { test: async () => ({ ok: true }) },
    });

    expect(await tester.test({ ...gemini(), provider: 'openai' })).toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });
});

describe('OfflineConnectionTester', () => {
  const tester = new OfflineConnectionTester();

  it('checks the shape of the key and of the model of each provider', async () => {
    expect(await tester.test(gemini())).toEqual({ ok: true });
    expect(await tester.test(gemini({ apiKey: 'short' }))).toEqual({
      ok: false,
      reason: 'invalid-key',
    });
    expect(await tester.test(gemini({ model: 'claude-opus-5-5' }))).toEqual({
      ok: false,
      reason: 'model-not-found',
    });
    expect(
      await tester.test({ provider: 'anthropic', model: 'claude-opus-5-5', apiKey: ANTHROPIC_KEY }),
    ).toEqual({ ok: true });
    expect(
      await tester.test({
        provider: 'anthropic',
        model: 'gemini-test-flash',
        apiKey: ANTHROPIC_KEY,
      }),
    ).toEqual({ ok: false, reason: 'model-not-found' });
  });
});
