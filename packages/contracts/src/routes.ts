/**
 * Single source of truth for HTTP paths and headers between pieces.
 *
 * - `/v1/*` on the gateway is the PUBLIC API used by the CLI, the GitHub Action and the extension
 *   (authenticated with `Authorization: Bearer <api key>`).
 * - `/internal/*` is service-to-service only: it must never be routed by the gateway and it
 *   requires the `x-internal-token` header.
 * - The registry exposes `/v1/*` to the internal network (no public exposure).
 */
export const ROUTES = {
  gateway: {
    verify: '/v1/auth/verify',
    analyses: '/v1/analyses',
    analysis: '/v1/analyses/:analysisId',
    analysisMarkdown: '/v1/analyses/:analysisId/markdown',
  },
  registry: {
    instances: '/v1/instances',
    instance: '/v1/instances/:instanceId',
    heartbeat: '/v1/instances/:instanceId/heartbeat',
    resolve: '/v1/services/:serviceName',
  },
  web: {
    verifyApiKey: '/internal/api-keys/verify',
    tenantLlmConfig: '/internal/tenants/:tenantId/llm-config',
  },
  reports: {
    createAnalysis: '/internal/analyses',
    getAnalysis: '/internal/analyses/:analysisId',
    getMarkdown: '/internal/analyses/:analysisId/markdown',
    deterministicResult: '/internal/analyses/:analysisId/deterministic',
    aiResult: '/internal/analyses/:analysisId/ai-result',
    failure: '/internal/analyses/:analysisId/failure',
  },
  retrieval: {
    retrieve: '/internal/retrieve',
  },
  llmAnalysis: {
    analyze: '/internal/analyze',
  },
  normalization: {
    query: '/internal/knowledge/query',
    sources: '/internal/sources',
    ingest: '/internal/ingest/:source',
  },
} as const;

export const HEADERS = {
  requestId: 'x-request-id',
  /** Shared secret for service-to-service calls (INTERNAL_SERVICE_TOKEN). */
  internalToken: 'x-internal-token',
  /** Tenant resolved by the gateway from the API key, propagated downstream. */
  tenantId: 'x-gyde-tenant-id',
} as const;

/** Replaces `:param` placeholders: `buildPath(ROUTES.gateway.analysis, { analysisId: 'a1' })`. */
export function buildPath(template: string, params: Record<string, string> = {}): string {
  return template.replace(/:([A-Za-z]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`Missing path parameter "${name}" for ${template}`);
    }
    return encodeURIComponent(value);
  });
}
