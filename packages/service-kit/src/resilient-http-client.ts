import { HEADERS, type ServiceName } from '@gyde/contracts';
import { NoHealthyInstanceError, type ServiceResolver } from '@gyde/discovery';
import {
  CircuitBreaker,
  CircuitOpenError,
  createBreakerFromEnv,
  type FallbackCache,
} from '@gyde/resilience';

import { HttpError, type ErrorCode } from './errors';

export class UpstreamServiceError extends Error {
  readonly status: number;
  readonly service: ServiceName;

  constructor(service: ServiceName, status: number, details?: string) {
    super(`Upstream service ${service} returned error ${status}${details ? `: ${details}` : ''}`);
    this.name = 'UpstreamServiceError';
    this.status = status;
    this.service = service;
  }
}

export interface ResilientHttpClientOptions {
  /** Name of the calling service (e.g. "gateway", "retrieval"). Used in circuit breaker names. */
  serviceName?: string;
  /** Service discovery resolver (e.g. RegistryClient). */
  resolver: ServiceResolver;
  /** Shared token passed in `x-internal-token` for service-to-service calls. */
  internalToken?: string;
  /**
   * Static fallback URLs when the registry has no instances or is unreachable.
   * e.g. `{ reports: 'http://reports:4500', web: 'http://web:3000' }`.
   */
  fallbackUrls?: Partial<Record<ServiceName, string>>;
  /** Optional fallback cache to serve stale/cached responses when a dependency is down. */
  fallbackCache?: FallbackCache<string>;
  /** Injectable fetch for tests. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Environment record for breaker settings (defaults to process.env). */
  env?: Record<string, string | undefined>;
  /** Preconfigured breakers by service name (useful for tests or custom options). */
  breakers?: Partial<Record<ServiceName, CircuitBreaker>>;
  /** Default call timeout in ms. Defaults to 10_000 ms. */
  timeoutMs?: number;
}

export interface ResilientRequestOptions extends Omit<RequestInit, 'body'> {
  /** Propagated request ID for distributed tracing (sent in `x-request-id`). */
  requestId?: string;
  body?: string | ArrayBuffer | Uint8Array | null;
  /** Skip fallback cache lookup/store for this call. */
  noCache?: boolean;
}

/**
 * Resilient HTTP client for all service-to-service communication.
 *
 * Sequence for every call:
 * 1. Resolve target instance via RegistryClient (with fallback to static *_URL).
 * 2. If no healthy instance exists, throws `NoHealthyInstanceError`.
 * 3. Wrap call in a dependency CircuitBreaker (`createBreakerFromEnv`).
 * 4. Perform HTTP fetch, propagating `x-request-id` and `x-internal-token`.
 * 5. On failure or when the circuit is open, return cached response from FallbackCache if available.
 */
/** Maps an HTTP status code to the closest `ErrorCode` for `HttpError`. */
function statusToCode(status: number): ErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'upstream_unavailable';
  if (status >= 400 && status < 500) return 'invalid_request';
  return 'internal';
}

export class ResilientHttpClient {
  private readonly breakers = new Map<ServiceName, CircuitBreaker>();
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: ResilientHttpClientOptions) {
    this.fetchFn = options.fetch ?? globalThis.fetch;
    if (options.breakers) {
      for (const [service, breaker] of Object.entries(options.breakers)) {
        if (breaker) {
          this.breakers.set(service as ServiceName, breaker);
        }
      }
    }
  }

  /**
   * Returns or creates a CircuitBreaker for the given target service.
   */
  getBreaker(service: ServiceName): CircuitBreaker {
    let breaker = this.breakers.get(service);
    if (!breaker) {
      const caller = this.options.serviceName ?? 'service';
      const breakerOptions = createBreakerFromEnv(`${caller}->${service}`, this.options.env);
      breaker = new CircuitBreaker(breakerOptions);
      this.breakers.set(service, breaker);
    }
    return breaker;
  }

  /**
   * Resolves the base URL for the given service, using discovery first, then static fallbacks.
   * Throws `NoHealthyInstanceError` if no instance can be resolved.
   */
  async resolveBaseUrl(service: ServiceName): Promise<string> {
    try {
      const instance = await this.options.resolver.pick(service);
      if (instance?.baseUrl) {
        return instance.baseUrl;
      }
    } catch (error) {
      if (
        !(error instanceof NoHealthyInstanceError) &&
        (error as Error)?.name !== 'NoHealthyInstanceError'
      ) {
        // Unexpected resolver error: fall through to fallbackUrls
      }
    }

    const fallbackUrl = this.options.fallbackUrls?.[service];
    if (fallbackUrl) {
      return fallbackUrl;
    }

    throw new NoHealthyInstanceError(service);
  }

  /**
   * Performs a resilient HTTP request to the target service.
   */
  async fetch(
    service: ServiceName,
    path: string,
    options: ResilientRequestOptions = {},
  ): Promise<Response> {
    const baseUrl = await this.resolveBaseUrl(service);
    const url = `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
    const breaker = this.getBreaker(service);

    const headers = new Headers(options.headers);
    if (options.requestId && !headers.has(HEADERS.requestId)) {
      headers.set(HEADERS.requestId, options.requestId);
    }
    if (this.options.internalToken && !headers.has(HEADERS.internalToken)) {
      headers.set(HEADERS.internalToken, this.options.internalToken);
    }

    const method = options.method?.toUpperCase() ?? 'GET';
    const isIdempotent = method === 'GET' || method === 'HEAD';
    const cacheKey = `${service}:${method}:${path}:${typeof options.body === 'string' ? options.body : ''}`;

    try {
      const response = await breaker.execute(async () => {
        const timeoutMs = this.options.timeoutMs ?? 10_000;
        const res = await this.fetchFn(url, {
          ...options,
          headers,
          signal: options.signal ?? AbortSignal.timeout(timeoutMs),
        });

        // 5xx responses represent upstream failures and count towards tripping the circuit breaker
        if (res.status >= 500) {
          const bodyText = await res.text().catch(() => '');
          throw new UpstreamServiceError(service, res.status, bodyText);
        }

        return res;
      });

      // Save to fallback cache if available and applicable
      if (this.options.fallbackCache && isIdempotent && response.ok && !options.noCache) {
        const clone = response.clone();
        const text = await clone.text().catch(() => null);
        if (text !== null) {
          await this.options.fallbackCache.set(cacheKey, text).catch(() => {});
        }
      }

      return response;
    } catch (error) {
      // Try fallback cache when call fails or circuit is open
      if (this.options.fallbackCache && isIdempotent && !options.noCache) {
        const cached = await this.options.fallbackCache.get(cacheKey).catch(() => undefined);
        if (cached) {
          return new Response(cached.value, {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-gyde-fallback-cached': 'true',
              'x-gyde-cached-at': String(cached.storedAt),
            },
          });
        }
      }

      // Propagate errors
      if (
        error instanceof NoHealthyInstanceError ||
        (error as Error)?.name === 'NoHealthyInstanceError'
      ) {
        throw error;
      }
      if (error instanceof CircuitOpenError || (error as Error)?.name === 'CircuitOpenError') {
        throw error;
      }
      throw error;
    }
  }

  /**
   * Convenience method to fetch and parse JSON from a target service.
   */
  async getJson<T = unknown>(
    service: ServiceName,
    path: string,
    options: Omit<ResilientRequestOptions, 'method' | 'body'> = {},
  ): Promise<T> {
    const res = await this.fetch(service, path, { ...options, method: 'GET' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new HttpError(statusToCode(res.status), `${service} returned ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  /**
   * Convenience method to post JSON to a target service and parse JSON response.
   */
  async postJson<T = unknown>(
    service: ServiceName,
    path: string,
    body?: unknown,
    options: Omit<ResilientRequestOptions, 'method' | 'body'> = {},
  ): Promise<T> {
    const headers = new Headers(options.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const res = await this.fetch(service, path, {
      ...options,
      method: 'POST',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new HttpError(statusToCode(res.status), `${service} returned ${res.status}: ${text}`);
    }

    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
