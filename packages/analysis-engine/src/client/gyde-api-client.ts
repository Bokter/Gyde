import {
  AnalysisAccepted,
  ApiError,
  AuthVerifyResponse,
  HTTP_STATUS_BY_CODE,
  Report,
  ROUTES,
  buildPath,
} from '@gyde/contracts';
import type { AnalysisRequest, ErrorCode } from '@gyde/contracts';
import {
  CircuitBreaker,
  CircuitOpenError,
  createBreakerFromEnv,
  type FallbackCache,
} from '@gyde/resilience';
import type { z } from 'zod';

import type { AnalysisGateway } from '../types';

export interface GydeApiClientOptions {
  /** GYDE_API_URL, e.g. http://localhost:4000 */
  apiUrl: string;
  /** GYDE_API_KEY, sent as `Authorization: Bearer <key>`. Never log it. */
  apiKey: string;
  /** Injectable for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Circuit Breaker around every call to the gateway. Defaults to CB_* env values. */
  breaker?: CircuitBreaker;
  /** Local cache of the last valid report, served (flagged degraded) while the circuit is open. */
  reportCache?: FallbackCache<Report>;
}

/**
 * Actionable gateway error: carries the HTTP status, the contract's ErrorCode and a next step
 * the user can take. `status: 0` means the gateway never answered (network failure or open
 * circuit). The API key never appears in the message or the hint.
 */
export class GydeApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  /** What the user should do next (interface text: Spanish). Safe to print. */
  readonly hint?: string;

  constructor(status: number, code: ErrorCode, message: string, hint?: string) {
    super(message);
    this.name = 'GydeApiError';
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

/** Hints shown to the user for the errors they can actually fix. */
const HINT_BY_CODE: Partial<Record<ErrorCode, string>> = {
  unauthorized:
    'La API key fue rechazada: revisa que GYDE_API_KEY contenga una llave vigente de la consola de Gyde.',
  plan_limit_exceeded:
    'Tu plan no permite este análisis o alcanzaste el límite de la cuota: revisa tu plan en la consola de Gyde.',
  rate_limited:
    'Se alcanzó el límite de peticiones del servidor: espera unos segundos y vuelve a intentarlo.',
  upstream_unavailable:
    'El servidor de Gyde no responde: revisa tu conexión o reintenta en unos minutos.',
};

/** The 4xx answers that mean "your request is wrong", not "the gateway is down". */
function isClientFault(status: number): boolean {
  return status >= 400 && status < 500;
}

function codeForStatus(status: number): ErrorCode {
  const entry = Object.entries(HTTP_STATUS_BY_CODE).find(([, s]) => s === status);
  return entry ? (entry[0] as ErrorCode) : 'internal';
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function toApiError(status: number, body: unknown): GydeApiError {
  const envelope = ApiError.safeParse(body);
  const code = envelope.success ? envelope.data.error.code : codeForStatus(status);
  const message = envelope.success
    ? envelope.data.error.message
    : `The gateway answered HTTP ${status}`;
  return new GydeApiError(status, code, message, HINT_BY_CODE[code]);
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

/**
 * HTTP adapter of the gateway (see the `AnalysisGateway` port). Every call goes through the
 * Circuit Breaker; when the circuit opens (or the gateway fails), `getReport` serves the last
 * cached report flagged as degraded instead of failing the customer's CI. Every response is
 * validated against the `@gyde/contracts` schemas before it leaves this class.
 */
export class GydeApiClient implements AnalysisGateway {
  readonly options: GydeApiClientOptions;
  private readonly fetchImpl: typeof fetch;
  readonly breaker: CircuitBreaker;

  constructor(options: GydeApiClientOptions) {
    this.options = options;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.breaker = options.breaker ?? new CircuitBreaker(createBreakerFromEnv('client->gateway'));
  }

  async verifyKey(): Promise<AuthVerifyResponse> {
    return this.request(ROUTES.gateway.verify, AuthVerifyResponse, { method: 'GET' });
  }

  async submitAnalysis(request: AnalysisRequest): Promise<AnalysisAccepted> {
    return this.request(ROUTES.gateway.analyses, AnalysisAccepted, {
      method: 'POST',
      body: request,
    });
  }

  async getReport(analysisId: string): Promise<Report> {
    let servedFromCache = false;
    const report = await this.request(
      buildPath(ROUTES.gateway.analysis, { analysisId }),
      Report,
      { method: 'GET' },
      async () => {
        servedFromCache = true;
        const entry = await this.reportCache?.get(analysisId);
        if (!entry) throw new CircuitOpenError(this.breaker.options.name);
        // A stale answer beats a red CI: flag it as degraded so the user can tell.
        return { ...entry.value, degraded: true };
      },
    );
    if (!servedFromCache) {
      await this.reportCache?.set(analysisId, report);
    }
    return report;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private get reportCache(): FallbackCache<Report> | undefined {
    return this.options.reportCache;
  }

  /**
   * One guarded call to the gateway. 4xx answers are returned as a resolved outcome (so they do
   * not count as breaker failures and never trigger the stale-cache fallback: the gateway is
   * alive, the problem is ours). 5xx, network failures and contract mismatches throw, so the
   * breaker counts them and the fallback can take over.
   */
  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: { method: 'GET' | 'POST'; body?: unknown },
    fallback?: () => Promise<T>,
  ): Promise<T> {
    const url = joinUrl(this.options.apiUrl, path);
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${this.options.apiKey}`,
    };
    const body = init.body === undefined ? undefined : JSON.stringify(init.body);
    if (body !== undefined) headers['content-type'] = 'application/json';

    type Outcome = { ok: true; value: T } | { ok: false; error: GydeApiError };

    // Error thrown by the guarded call, so a fallback miss can re-surface it instead of a
    // confusing "no cache entry" error.
    let lastCallError: unknown;

    let outcome: Outcome;
    try {
      outcome = await this.breaker.execute<Outcome>(
        async (): Promise<Outcome> => {
          try {
            let response: Response;
            try {
              response = await this.fetchImpl(url, { method: init.method, headers, body });
            } catch {
              throw new GydeApiError(
                0,
                'upstream_unavailable',
                `Cannot reach the gateway at ${url}`,
                HINT_BY_CODE.upstream_unavailable,
              );
            }

            if (!response.ok) {
              const error = toApiError(response.status, await readJson(response));
              if (isClientFault(response.status)) return { ok: false, error };
              throw error;
            }

            const parsed = schema.safeParse(await readJson(response));
            if (!parsed.success) {
              const issues = parsed.error.issues
                .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
                .join('; ');
              throw new GydeApiError(
                response.status,
                'internal',
                `The gateway answered a response that does not match the contract (${issues})`,
              );
            }
            return { ok: true, value: parsed.data };
          } catch (err) {
            lastCallError = err;
            throw err;
          }
        },
        {
          fallback: fallback
            ? async (): Promise<Outcome> => {
                try {
                  return { ok: true, value: await fallback() };
                } catch (fallbackErr) {
                  // Nothing usable in the cache: surface the original problem, not the miss.
                  throw lastCallError ?? fallbackErr;
                }
              }
            : undefined,
        },
      );
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        throw new GydeApiError(
          0,
          'upstream_unavailable',
          err.message,
          HINT_BY_CODE.upstream_unavailable,
        );
      }
      throw err;
    }

    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
}
