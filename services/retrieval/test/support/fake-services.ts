import {
  AnalysisFailure,
  DeterministicResult,
  HEADERS,
  type KnowledgeObject,
  KnowledgeQuery,
  LlmAnalysisRequest,
  ROUTES,
  buildPath,
} from '@gyde/contracts';

/** The knowledge the fixtures produce (fixtures/sources/osv + ghsa), as normalization stores it. */
export const fixtureKnowledge: KnowledgeObject[] = [
  {
    id: 'ghsa:GHSA-0000-0000-0001',
    kind: 'vulnerability',
    source: 'ghsa',
    sourceKind: 'structured',
    trust: 'high',
    title: 'Sample advisory: unsafe deserialization in Acme.Serialization',
    summary:
      'Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.',
    aliases: ['GHSA-0000-0000-0001', 'SAMPLE-0001'],
    severity: 'high',
    cvss: 7.5,
    affected: [{ ecosystem: 'nuget', name: 'Acme.Serialization', fixed: '1.5.0' }],
    gameEngines: [],
    url: 'https://github.com/advisories/GHSA-0000-0000-0001',
    ingestedAt: '2026-10-01T12:00:00Z',
  },
  {
    id: 'osv:SAMPLE-0001',
    kind: 'vulnerability',
    source: 'osv',
    sourceKind: 'structured',
    trust: 'high',
    title: 'Sample advisory: unsafe deserialization in Acme.Serialization',
    summary:
      'Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.',
    aliases: ['SAMPLE-0001'],
    severity: 'high',
    cvss: 7.5,
    affected: [{ ecosystem: 'nuget', name: 'Acme.Serialization', introduced: '0', fixed: '1.5.0' }],
    gameEngines: [],
    url: 'https://example.com/advisories/sample-0001',
    ingestedAt: '2026-10-01T12:00:00Z',
  },
  {
    id: 'osv:SAMPLE-0002',
    kind: 'vulnerability',
    source: 'osv',
    sourceKind: 'structured',
    trust: 'high',
    title: 'Sample advisory: path handling issue in Acme.Unrelated',
    summary: 'Synthetic advisory about a package that the sample projects do not use.',
    aliases: ['SAMPLE-0002'],
    severity: 'medium',
    cvss: 4.4,
    affected: [{ ecosystem: 'nuget', name: 'Acme.Unrelated', introduced: '0', fixed: '3.0.0' }],
    gameEngines: [],
    ingestedAt: '2026-10-01T12:00:00Z',
  },
  {
    id: 'osv:SAMPLE-0003',
    kind: 'vulnerability',
    source: 'osv',
    sourceKind: 'structured',
    trust: 'high',
    title: 'Sample advisory: regression only in Acme.Serialization 2.0.0 to 2.0.x',
    summary: 'Its affected range does not include 1.4.0.',
    aliases: ['SAMPLE-0003'],
    severity: 'low',
    cvss: 2.5,
    affected: [
      { ecosystem: 'nuget', name: 'Acme.Serialization', introduced: '2.0.0', fixed: '2.1.0' },
    ],
    gameEngines: [],
    ingestedAt: '2026-10-01T12:00:00Z',
  },
];

export const HOSTS = {
  normalization: 'http://normalization.test',
  reports: 'http://reports.test',
  llm: 'http://llm.test',
} as const;

export interface Call {
  service: 'normalization' | 'reports' | 'llm';
  path: string;
  token: string | null;
  body: unknown;
}

export type Behavior = 'ok' | 'down' | 'error500' | 'reject400' | 'garbage';

/**
 * Stand-ins for the services Retrieval talks to, behind a fake `fetch`. Like the real ones they
 * check the internal token and validate the messages with the shared contracts, so a wrong
 * payload fails the test instead of passing silently.
 */
export class FakeServices {
  readonly calls: Call[] = [];
  readonly deterministicResults: DeterministicResult[] = [];
  readonly failures: AnalysisFailure[] = [];
  readonly llmRequests: LlmAnalysisRequest[] = [];
  readonly behavior: Record<Call['service'], Behavior> = {
    normalization: 'ok',
    reports: 'ok',
    llm: 'ok',
  };
  /** The next N calls to a service answer 500, then it behaves as `behavior` says. */
  readonly failNext: Record<Call['service'], number> = { normalization: 0, reports: 0, llm: 0 };
  /** Holds every Reports call until it resolves (to prove Retrieval answered before it). */
  reportsGate: Promise<void> | undefined;
  /** Knowledge that normalization holds. */
  knowledge: KnowledgeObject[] = fixtureKnowledge;

  constructor(private readonly expectedToken: string) {}

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const service = (Object.entries(HOSTS).find(([, host]) => host === url.origin)?.[0] ??
      'unknown') as Call['service'];
    const headers = new Headers(init?.headers);
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
    this.calls.push({
      service,
      path: url.pathname,
      token: headers.get(HEADERS.internalToken),
      body,
    });

    if (service === 'reports') await this.reportsGate;
    if (this.failNext[service] > 0) {
      this.failNext[service] -= 1;
      return new Response('boom', { status: 500 });
    }
    const mode = this.behavior[service];
    if (mode === 'down') throw new TypeError('fetch failed');
    if (mode === 'error500') return new Response('boom', { status: 500 });
    if (mode === 'reject400') return new Response('{}', { status: 400 });
    if (mode === 'garbage') return Response.json({ objects: 'not a list' });
    if (headers.get(HEADERS.internalToken) !== this.expectedToken) {
      return new Response('{}', { status: 401 });
    }

    if (service === 'normalization') return this.normalization(body);
    if (service === 'reports') return this.reports(url.pathname, body);
    if (service === 'llm') {
      this.llmRequests.push(LlmAnalysisRequest.parse(body));
      return new Response(null, { status: 202 });
    }
    return new Response('{}', { status: 404 });
  };

  private normalization(body: unknown): Response {
    const query = KnowledgeQuery.parse(body);
    const wanted = new Set(query.packages.map((p) => `${p.ecosystem}:${p.name.toLowerCase()}`));
    // Like the real service: objects that MENTION the packages, whatever the version.
    const objects = this.knowledge.filter((object) =>
      object.affected.some((range) => wanted.has(`${range.ecosystem}:${range.name.toLowerCase()}`)),
    );
    return Response.json({ objects });
  }

  private reports(path: string, body: unknown): Response {
    const analysisId = (/\/analyses\/([^/]+)\//.exec(path) ?? [])[1];
    if (path === buildPath(ROUTES.reports.deterministicResult, { analysisId: analysisId ?? '' })) {
      this.deterministicResults.push(DeterministicResult.parse(body));
      return new Response(null, { status: 202 });
    }
    if (path === buildPath(ROUTES.reports.failure, { analysisId: analysisId ?? '' })) {
      this.failures.push(AnalysisFailure.parse(body));
      return new Response(null, { status: 202 });
    }
    return new Response('{}', { status: 404 });
  }

  callsTo(service: Call['service']): Call[] {
    return this.calls.filter((call) => call.service === service);
  }
}
