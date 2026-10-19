import { HEADERS, ROUTES, type InstanceInfo, type ServiceName } from '@gyde/contracts';
import type { ServiceResolver } from '@gyde/discovery';
import {
  CircuitOpenError,
  NoHealthyInstanceError,
  ResilientHttpClient,
  UpstreamServiceError,
} from '@gyde/service-kit';
import { describe, expect, it } from 'vitest';

import { HttpRetrievalClient } from '../src/infrastructure/adapters/http-retrieval-client.adapter';

const token = 'test-internal-token-123456';
const request = {
  analysisId: 'analysis-1',
  tenantId: 'tenant-1',
  request: {},
  entitlements: {},
} as never;

/** A registry that knows the given Retrieval instances (or none). */
function registryWith(baseUrls: string[]): ServiceResolver {
  const instances = baseUrls.map((baseUrl, index): InstanceInfo => ({
    instanceId: `retrieval-${index + 1}`,
    serviceName: 'retrieval',
    baseUrl,
    version: '0.0.0',
    healthy: true,
    registeredAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
  }));
  return {
    resolve: async (_service: ServiceName) => instances,
    pick: async (service: ServiceName) => {
      const first = instances[0];
      if (!first) throw new NoHealthyInstanceError(service);
      return first;
    },
  };
}

/** Records the calls and answers with `status`. */
function recordingFetch(status: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(status === 202 ? '{}' : 'boom', { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function clientWith(
  resolver: ServiceResolver,
  fetchImpl: typeof fetch,
  env: Record<string, string> = {},
) {
  return new HttpRetrievalClient(
    new ResilientHttpClient({
      serviceName: 'reports',
      resolver,
      internalToken: token,
      fallbackUrls: { retrieval: 'http://static-retrieval:4300' },
      fetch: fetchImpl,
      env,
    }),
  );
}

describe('HttpRetrievalClient (discovery and circuit breaker)', () => {
  it('finds Retrieval through service discovery and sends the internal token', async () => {
    const { calls, fetchImpl } = recordingFetch(202);
    const client = clientWith(registryWith(['http://retrieval-1:4300']), fetchImpl);

    await client.retrieve(request);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`http://retrieval-1:4300${ROUTES.retrieval.retrieve}`);
    expect(new Headers(calls[0]?.init.headers).get(HEADERS.internalToken)).toBe(token);
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ analysisId: 'analysis-1' });
  });

  it('falls back to the static RETRIEVAL_URL when the registry has no healthy instance', async () => {
    const { calls, fetchImpl } = recordingFetch(202);
    const client = clientWith(registryWith([]), fetchImpl);

    await client.retrieve(request);

    expect(calls[0]?.url).toBe(`http://static-retrieval:4300${ROUTES.retrieval.retrieve}`);
  });

  it('refuses a rejection from Retrieval, so the analysis can be marked as failed', async () => {
    const { fetchImpl } = recordingFetch(400);
    const client = clientWith(registryWith(['http://retrieval-1:4300']), fetchImpl);

    await expect(client.retrieve(request)).rejects.toThrow('retrieval returned 400');
  });

  it('opens the circuit after repeated failures and stops calling Retrieval', async () => {
    const { calls, fetchImpl } = recordingFetch(503);
    const client = clientWith(registryWith(['http://retrieval-1:4300']), fetchImpl, {
      CB_FAILURE_THRESHOLD: '2',
      CB_MIN_CALLS: '2',
      CB_OPEN_TIMEOUT_MS: '60000',
    });

    await expect(client.retrieve(request)).rejects.toBeInstanceOf(UpstreamServiceError);
    await expect(client.retrieve(request)).rejects.toBeInstanceOf(UpstreamServiceError);
    await expect(client.retrieve(request)).rejects.toBeInstanceOf(CircuitOpenError);

    expect(calls).toHaveLength(2);
  });
});
