import type { AiResult, InternalLlmConfig } from '@gyde/contracts';

import type { FindingAnalyzer } from '../../application/ports/finding-analyzer';
import type { AnalysisInput } from '../../domain/analysis';
import { MODEL_SYSTEM_PROMPT, applyModelPayload, buildUserPrompt } from '../../domain/prompt';
import { parseAiResult } from '../mappers/ai-result.mapper';
import { parseModelOutput } from './model-output.parser';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_TIMEOUT_MS = 30_000;

export interface GeminiFindingAnalyzerOptions {
  /** Injectable for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Overridable so tests never reach the real API. */
  baseUrl?: string;
  /** Abandons a call that takes longer than this; the circuit breaker counts it as a failure. */
  timeoutMs?: number;
}

/** What is read of a `generateContent` answer. */
interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  promptFeedback?: { blockReason?: string };
}

/** The model name goes into the URL path: only plain model ids are allowed there. */
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * Second provider behind the `FindingAnalyzer` port: the Gemini API (`generateContent`), with the
 * tenant's own key (BYOK). Same contract as the Anthropic adapter: the model only adds
 * explanations and a priority order; every fact still comes from the deterministic engine, and the
 * merged result is validated with the `AiResult` contract.
 *
 * The API key travels in the `x-goog-api-key` header of one request and never in the URL (URLs end
 * up in logs), and it appears in no message this class builds: a failure only carries a status.
 */
export class GeminiFindingAnalyzer implements FindingAnalyzer {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: GeminiFindingAnalyzerOptions = {}) {
    this.fetchFn = options.fetch ?? fetch;
    this.baseUrl = (options.baseUrl ?? GEMINI_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async analyze(request: AnalysisInput, credentials: InternalLlmConfig): Promise<AiResult> {
    const model = credentials.model.replace(/^models\//, '');
    if (!MODEL_ID.test(model)) throw new Error('Gemini model name is not valid');

    const response = await this.fetchFn(`${this.baseUrl}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': credentials.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: MODEL_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(request) }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    // The status only: a provider answer may echo parts of the request, and it is not ours to keep.
    if (!response.ok) throw new Error(`Gemini answered ${response.status}`);

    const body = (await response.json()) as GenerateContentResponse;
    if (body.promptFeedback?.blockReason) throw new Error('Gemini blocked the request');

    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('');
    if (!text.trim()) throw new Error('Gemini answered without text content');

    return parseAiResult(applyModelPayload(request, parseModelOutput(text)));
  }
}
