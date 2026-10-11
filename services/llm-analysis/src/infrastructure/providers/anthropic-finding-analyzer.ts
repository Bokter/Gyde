import type { AiResult, InternalLlmConfig, LlmAnalysisRequest } from '@gyde/contracts';

import type { FindingAnalyzer } from '../../application/ports/finding-analyzer';
import {
  MODEL_SYSTEM_PROMPT,
  ModelPayload,
  applyModelPayload,
  buildUserPrompt,
  extractJsonText,
} from '../../domain/prompt';

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 30_000;

export interface AnthropicFindingAnalyzerOptions {
  /** Injectable for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Overridable so tests never reach the real API. */
  baseUrl?: string;
  /** Abandons a call that takes longer than this; the circuit breaker counts it as a failure. */
  timeoutMs?: number;
}

/**
 * Real provider behind the `FindingAnalyzer` port: Anthropic Messages API, with the tenant's own
 * key (BYOK). The model only adds explanations and a priority order; every fact still comes from
 * the deterministic engine, and the merged result is validated with the `AiResult` contract.
 *
 * Anything that is not a valid JSON payload is an error (`llm-error` for the caller): free text
 * from a model never reaches a report. The API key travels in the `x-api-key` header of one
 * request and appears in no message this class builds.
 */
export class AnthropicFindingAnalyzer implements FindingAnalyzer {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: AnthropicFindingAnalyzerOptions = {}) {
    this.fetchFn = options.fetch ?? fetch;
    this.baseUrl = (options.baseUrl ?? ANTHROPIC_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async analyze(request: LlmAnalysisRequest, credentials: InternalLlmConfig): Promise<AiResult> {
    const response = await this.fetchFn(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': credentials.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: credentials.model,
        max_tokens: 4096,
        system: MODEL_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(request) }],
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    // The status only: a provider answer may echo parts of the request, and it is not ours to keep.
    if (!response.ok) throw new Error(`Anthropic answered ${response.status}`);

    const body = (await response.json()) as { content?: { type?: string; text?: string }[] };
    const text = (body.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');
    if (!text.trim()) throw new Error('Anthropic answered without text content');

    const payload = ModelPayload.parse(JSON.parse(extractJsonText(text)));
    return applyModelPayload(request, payload);
  }
}
