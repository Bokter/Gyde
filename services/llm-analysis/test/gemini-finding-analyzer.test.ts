import type { InternalLlmConfig } from '@gyde/contracts';
import { describe, expect, it } from 'vitest';

import { GeminiFindingAnalyzer } from '../src/infrastructure/adapters/gemini-finding-analyzer.adapter';
import { analysisPayload } from './support/fake-services';

const API_KEY = 'AIza-test-key-0123456789abcdefghijklmnop';
const credentials: InternalLlmConfig = {
  tenantId: 'tenant-1',
  provider: 'gemini',
  model: 'gemini-test-flash',
  apiKey: API_KEY,
};

interface Call {
  url: string;
  headers: Headers;
  body: {
    systemInstruction: unknown;
    contents: { parts: { text: string }[] }[];
    generationConfig: unknown;
  };
}

/** A Gemini API that records the calls and answers with `reply`. */
function fakeGemini(reply: () => Response) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      headers: new Headers(init.headers),
      body: JSON.parse(String(init.body)),
    });
    return reply();
  }) as typeof fetch;
  return {
    calls,
    analyzer: new GeminiFindingAnalyzer({ fetch: fetchImpl, baseUrl: 'https://gemini.test' }),
  };
}

/** The answer a model gives: one explanation per finding, in the order of the priority. */
function answerFor(ids: string[]): Response {
  const text = JSON.stringify({
    summary: 'A short summary.',
    explanations: ids.map((id) => ({ id, aiExplanation: `Explanation of ${id}.` })),
  });
  return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
}

describe('GeminiFindingAnalyzer', () => {
  it('asks generateContent with the key in a header, never in the URL, and merges the answer', async () => {
    const request = analysisPayload();
    const ids = request.findings.map((finding) => finding.id).reverse();
    const { calls, analyzer } = fakeGemini(() => answerFor(ids));

    const result = await analyzer.analyze(request, credentials);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe('https://gemini.test/v1beta/models/gemini-test-flash:generateContent');
    expect(call?.url).not.toContain(API_KEY);
    expect(call?.headers.get('x-goog-api-key')).toBe(API_KEY);
    expect(call?.body.generationConfig).toMatchObject({ responseMimeType: 'application/json' });
    // What the model sees is the same data as with any provider: names, versions, evidence.
    expect(call?.body.contents[0]?.parts[0]?.text).toContain(request.analysisId);

    // The model's order is the priority, and it only adds explanations.
    expect(result.findings.map((finding) => finding.id)).toEqual(ids);
    expect(result.findings[0]?.aiExplanation).toBe(`Explanation of ${ids[0]}.`);
    expect(result.summary).toBe('A short summary.');
  });

  it('accepts a model name written as models/<id>', async () => {
    const request = analysisPayload();
    const { calls, analyzer } = fakeGemini(() => answerFor(request.findings.map((f) => f.id)));

    await analyzer.analyze(request, { ...credentials, model: 'models/gemini-test-flash' });

    expect(calls[0]?.url).toContain('/models/gemini-test-flash:generateContent');
  });

  it('refuses a model name that could change the path, without calling the API', async () => {
    const { calls, analyzer } = fakeGemini(() => answerFor([]));

    for (const model of ['../x', 'gemini x', 'a/b', 'gemini?key=1', '']) {
      await expect(analyzer.analyze(analysisPayload(), { ...credentials, model })).rejects.toThrow(
        'model name is not valid',
      );
    }
    expect(calls).toHaveLength(0);
  });

  it('fails with the status only when Gemini answers an error, and never echoes the key', async () => {
    const { analyzer } = fakeGemini(
      () => new Response(`API key not valid: ${API_KEY}`, { status: 400 }),
    );

    const failure = await analyzer.analyze(analysisPayload(), credentials).catch((e: Error) => e);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('Gemini answered 400');
    expect((failure as Error).message).not.toContain(API_KEY);
  });

  it('fails when the prompt is blocked or the answer has no text', async () => {
    const blocked = fakeGemini(() => Response.json({ promptFeedback: { blockReason: 'SAFETY' } }));
    await expect(blocked.analyzer.analyze(analysisPayload(), credentials)).rejects.toThrow(
      'blocked the request',
    );

    const empty = fakeGemini(() => Response.json({ candidates: [{ content: { parts: [] } }] }));
    await expect(empty.analyzer.analyze(analysisPayload(), credentials)).rejects.toThrow(
      'without text content',
    );
  });

  it('never lets free text, an unknown finding or a thought into the report', async () => {
    const freeText = fakeGemini(() =>
      Response.json({ candidates: [{ content: { parts: [{ text: 'Upgrade everything.' }] } }] }),
    );
    await expect(freeText.analyzer.analyze(analysisPayload(), credentials)).rejects.toThrow();

    const unknown = fakeGemini(() => answerFor(['ghost-finding']));
    await expect(unknown.analyzer.analyze(analysisPayload(), credentials)).rejects.toThrow(
      'unknown or duplicated finding',
    );

    // A part flagged as a thought is the model's reasoning, not the answer: it is ignored.
    const request = analysisPayload();
    const text = JSON.stringify({
      explanations: request.findings.map((f) => ({ id: f.id, aiExplanation: 'Real.' })),
    });
    const withThought = fakeGemini(() =>
      Response.json({
        candidates: [
          { content: { parts: [{ text: 'thinking out loud', thought: true }, { text }] } },
        ],
      }),
    );
    const result = await withThought.analyzer.analyze(request, credentials);
    expect(result.findings.every((finding) => finding.aiExplanation === 'Real.')).toBe(true);
  });
});
