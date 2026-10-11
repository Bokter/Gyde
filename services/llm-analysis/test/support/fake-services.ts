import {
  type AiResult,
  type AnalysisFailure,
  AiResult as AiResultSchema,
  AnalysisFailure as AnalysisFailureSchema,
  HEADERS,
  type InternalLlmConfig,
  InternalLlmConfig as InternalLlmConfigSchema,
  type LlmAnalysisRequest,
} from '@gyde/contracts';
import {
  sampleAnalysisRequest,
  sampleLicenseFinding,
  sampleVulnerabilityFinding,
} from '@gyde/contracts/samples';

export const HOSTS = {
  web: 'http://web.test',
  reports: 'http://reports.test',
  anthropic: 'https://api.anthropic.test',
} as const;

export type AnthropicBehavior = 'ok' | 'error500' | 'down' | 'freeText' | 'unknownId';

export interface RecordedCall {
  service: 'web' | 'reports' | 'anthropic';
  path: string;
  token: string | null;
  body: unknown;
}

/**
 * Stand-ins for everything llm-analysis talks to, behind a fake `fetch`: Web (the BYOK config),
 * Reports (where the result is delivered) and the Anthropic API. Like the real services they
 * check the internal token and validate the messages with the shared contracts, so a wrong
 * payload fails the test instead of passing silently.
 */
export class FakeServices {
  readonly calls: RecordedCall[] = [];
  readonly aiResults: AiResult[] = [];
  readonly failures: AnalysisFailure[] = [];
  readonly anthropicBodies: { model: string; system: string; user: string }[] = [];
  /** tenantId → what Web answers. Absent = 404, like a studio without a key. */
  readonly llmConfigs = new Map<string, InternalLlmConfig>();
  /** API keys whose calls fail: lets one tenant's key break without touching the others. */
  readonly failingKeys = new Set<string>();
  anthropicBehavior: AnthropicBehavior = 'ok';
  /** Resolves only when released: holds the next call to that service open. */
  readonly gates: Partial<Record<'web' | 'reports' | 'anthropic', Promise<void>>> = {};

  constructor(private readonly expectedToken: string) {}

  setConfig(tenantId: string, config: InternalLlmConfig): void {
    this.llmConfigs.set(tenantId, config);
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
    const service =
      url.origin === HOSTS.web ? 'web' : url.origin === HOSTS.reports ? 'reports' : 'anthropic';
    this.calls.push({
      service,
      path: url.pathname,
      token: headers.get(HEADERS.internalToken),
      body,
    });
    await this.gates[service];

    if (service === 'anthropic') return this.anthropic(headers, body);

    if (headers.get(HEADERS.internalToken) !== this.expectedToken) {
      return new Response('{}', { status: 401 });
    }

    if (service === 'web') return this.web(url.pathname);
    return this.reports(url.pathname, body);
  };

  callsTo(service: RecordedCall['service']): RecordedCall[] {
    return this.calls.filter((call) => call.service === service);
  }

  private web(path: string): Response {
    const tenantId = (/\/internal\/tenants\/([^/]+)\/llm-config/.exec(path) ?? [])[1];
    const config = tenantId ? this.llmConfigs.get(tenantId) : undefined;
    if (!config) return new Response('{}', { status: 404 });
    return Response.json(InternalLlmConfigSchema.parse(config));
  }

  private reports(path: string, body: unknown): Response {
    if (path.endsWith('/ai-result')) {
      this.aiResults.push(AiResultSchema.parse(body));
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/failure')) {
      this.failures.push(AnalysisFailureSchema.parse(body));
      return new Response(null, { status: 204 });
    }
    return new Response('{}', { status: 404 });
  }

  private anthropic(headers: Headers, body: unknown): Response {
    if (this.anthropicBehavior === 'down') throw new TypeError('fetch failed');
    if (this.anthropicBehavior === 'error500') return new Response('boom', { status: 500 });
    if (this.failingKeys.has(headers.get('x-api-key') ?? '')) {
      return new Response('invalid api key', { status: 401 });
    }

    const request = body as { model: string; system: string; messages: { content: string }[] };
    const user = request.messages[0]?.content ?? '{}';
    this.anthropicBodies.push({ model: request.model, system: request.system, user });

    if (this.anthropicBehavior === 'freeText') {
      return Response.json({ content: [{ type: 'text', text: 'You should upgrade everything.' }] });
    }

    const ids = (JSON.parse(user) as { findings: { id: string }[] }).findings.map((f) => f.id);
    if (this.anthropicBehavior === 'unknownId') {
      return Response.json({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'A summary.',
              explanations: [
                { id: 'ghost-finding', aiExplanation: 'This id is not in the input.' },
              ],
            }),
          },
        ],
      });
    }

    // Deterministic, and reversed on purpose: the model's order IS the priority of the report.
    return Response.json({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: 'Mocked model summary.',
            explanations: [...ids].reverse().map((id, index) => ({
              id,
              aiExplanation: `Model explanation ${index + 1} for ${id}.`,
            })),
          }),
        },
      ],
    });
  }
}

/** Convenience builder so tests never hand-write the analysis payload. */
export function analysisPayload(
  overrides: Partial<
    Pick<LlmAnalysisRequest, 'analysisId' | 'tenantId' | 'findings' | 'evidence'>
  > = {},
): LlmAnalysisRequest {
  return {
    analysisId: overrides.analysisId ?? 'analysis-1',
    tenantId: overrides.tenantId ?? 'tenant-1',
    project: sampleAnalysisRequest.project,
    findings: overrides.findings ?? [sampleVulnerabilityFinding, sampleLicenseFinding],
    evidence: overrides.evidence ?? [
      ...sampleVulnerabilityFinding.evidence,
      ...sampleLicenseFinding.evidence,
    ],
  };
}
