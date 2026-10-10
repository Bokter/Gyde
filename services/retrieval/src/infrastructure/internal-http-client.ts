import { HEADERS, type ServiceName } from '@gyde/contracts';
import { type CircuitBreaker, CircuitOpenError } from '@gyde/resilience';

import type { ServiceLocator } from './service-locator';

/** The service cannot be reached or failed on its side (network, timeout, 5xx, open circuit). */
export class ServiceUnavailableError extends Error {
  constructor(
    readonly service: ServiceName,
    reason: string,
  ) {
    super(`${service} is unavailable: ${reason}`);
    this.name = 'ServiceUnavailableError';
  }
}

/** The service answered, but refused the request (4xx): a bug on our side, not an outage. */
export class ServiceRejectedError extends Error {
  constructor(
    readonly service: ServiceName,
    readonly status: number,
  ) {
    super(`${service} rejected the request with status ${status}`);
    this.name = 'ServiceRejectedError';
  }
}

export interface InternalHttpClientOptions {
  locator: ServiceLocator;
  /** `INTERNAL_SERVICE_TOKEN`: every /internal route requires it. */
  internalToken: string;
  /** One breaker per dependency (service), created by the composition root. */
  breakers: Partial<Record<ServiceName, CircuitBreaker>>;
  /** Injectable for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** A call that takes longer than this is abandoned (the breaker counts it as a failure). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * POSTs JSON to another Gyde service. EVERY outgoing call goes through here, so every call is
 * behind the circuit breaker of its dependency and resolves its address through discovery.
 *
 * Outage (network, timeout, 5xx, open circuit) → `ServiceUnavailableError`; the caller decides
 * what degrades. A 4xx is returned to the breaker as a success (the service is alive) and
 * surfaces as `ServiceRejectedError`.
 */
export class InternalHttpClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: InternalHttpClientOptions) {
    this.fetchFn = options.fetch ?? fetch;
  }

  async postJson(service: ServiceName, path: string, body: unknown): Promise<unknown> {
    const breaker = this.options.breakers[service];
    if (!breaker) throw new Error(`No circuit breaker configured for ${service}`);

    let outcome: { status: number; json: unknown };
    try {
      outcome = await breaker.execute(() => this.send(service, path, body));
    } catch (error) {
      if (error instanceof ServiceUnavailableError) throw error;
      if (error instanceof CircuitOpenError) {
        throw new ServiceUnavailableError(service, 'its circuit is open');
      }
      // No instance, network error, timeout: all of them are an outage of that service.
      throw new ServiceUnavailableError(service, describe(error));
    }

    if (outcome.status >= 400) throw new ServiceRejectedError(service, outcome.status);
    return outcome.json;
  }

  private async send(
    service: ServiceName,
    path: string,
    body: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const baseUrl = await this.options.locator.baseUrl(service);
    const response = await this.fetchFn(new URL(path, baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADERS.internalToken]: this.options.internalToken,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (response.status >= 500) {
      throw new ServiceUnavailableError(service, `it answered ${response.status}`);
    }
    // A 4xx or 2xx: the service is alive. The body may be empty (202) or not JSON.
    const text = await response.text();
    return { status: response.status, json: text ? safeJson(text) : undefined };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A short reason without secrets: error names and messages only, never request data. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : 'unknown error';
}
