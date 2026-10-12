import { HEADERS, type VerifyApiKeyResponse } from '@gyde/contracts';
import { sampleEntitlementsPro } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import type { NestFastifyApplication } from '@gyde/service-kit';

import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';

export const INTERNAL_TOKEN = 'test-internal-token-123456';
export const VALID_KEY = 'gyde_test_valid_key_0123456789';
export const REVOKED_KEY = 'gyde_test_revoked_key_0123456789';

export const validVerification: VerifyApiKeyResponse = {
  valid: true,
  tenantId: 'tenant-1',
  apiKeyId: 'key-1',
  entitlements: sampleEntitlementsPro,
};

export interface RecordedCall {
  method: string;
  url: string;
  headers: Headers;
  body: string | undefined;
}

export type Handler = (call: RecordedCall) => Response | Promise<Response>;

/** A `fetch` that records every call and answers with `handler`. */
export function fakeFetch(handler: Handler) {
  const calls: RecordedCall[] = [];
  const fn: typeof fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: RecordedCall = {
      method: init?.method ?? 'GET',
      url: input.toString(),
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fn, calls };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Answers Web's key verification the way the real endpoint does. */
export function webAnswer(call: RecordedCall): Response {
  const { apiKey } = JSON.parse(call.body ?? '{}') as { apiKey: string };
  if (apiKey === VALID_KEY) return json(validVerification);
  if (apiKey === REVOKED_KEY) return json({ valid: false, reason: 'revoked' });
  return json({ valid: false, reason: 'unknown' });
}

export interface TestAppOptions {
  fetch: typeof fetch;
  /** Without `REPORTS_URL` and `WEB_URL` (and no registry) there is no instance to call. */
  withUrls?: boolean;
  now?: () => number;
  logDestination?: { write(chunk: string): void };
}

/** A gateway on a fake network, with no registry: neighbours come from the static URLs. */
export function makeApp(options: TestAppOptions): Promise<NestFastifyApplication> {
  const config = configSchema.parse({
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
    ...(options.withUrls !== false && {
      WEB_URL: 'http://web.test',
      REPORTS_URL: 'http://reports.test',
    }),
  });
  return createApp({
    config,
    logger: createLogger({
      name: 'gateway-test',
      level: options.logDestination ? 'debug' : 'silent',
      ...(options.logDestination && { destination: options.logDestination }),
    }),
    module: { fetch: options.fetch, ...(options.now && { now: options.now }) },
  });
}

export const bearer = (key: string) => ({ authorization: `Bearer ${key}` });
export const tenantHeader = HEADERS.tenantId;
