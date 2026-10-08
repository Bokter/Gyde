/**
 * CIRCUIT BREAKER (architecture doc, "Patrón arquitectónico 1").
 *
 * Wraps one outgoing dependency (a service, an AI provider, an external data source) and stops
 * sending requests to it after repeated failures, answering with a fallback instead, so a slow or
 * dead dependency cannot cascade into the CI pipelines of every customer.
 *
 *   CLOSED ──(5 consecutive failures OR 50% failures inside the window)──▶ OPEN
 *   OPEN ──(open timeout elapsed)──▶ HALF_OPEN (limited probe calls)
 *   HALF_OPEN ──(probes succeed)──▶ CLOSED
 *   HALF_OPEN ──(a probe fails)──▶ OPEN (the timer restarts)
 *
 * TODO(area-1): implement. Acceptance criteria: docs/tasks/area-1-plataforma-y-borde.md and the
 * pending specs in test/circuit-breaker.test.ts.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Used in logs and metrics, e.g. "gateway->reports" or "llm:tenant-42:anthropic". */
  name: string;
  /** Open after this many consecutive failures. Default from env: CB_FAILURE_THRESHOLD (5). */
  failureThreshold: number;
  /** Open when this share (0-1) of the calls inside the window failed. CB_FAILURE_RATE (0.5). */
  failureRate: number;
  /** Sliding window used by `failureRate`. CB_WINDOW_MS. */
  windowMs: number;
  /** How long to stay open before probing again. CB_OPEN_TIMEOUT_MS. */
  openTimeoutMs: number;
  /** Probe calls allowed while half-open. CB_HALF_OPEN_MAX_CALLS. */
  halfOpenMaxCalls: number;
  /** A call slower than this counts as a failure. CB_CALL_TIMEOUT_MS. */
  callTimeoutMs: number;
  /** Injectable clock so tests are deterministic. Defaults to Date.now. */
  now?: () => number;
  onStateChange?: (change: { name: string; from: CircuitState; to: CircuitState }) => void;
}

export interface ExecuteOptions<T> {
  /**
   * Answer used when the circuit is open or the call fails. Typically the last cached response
   * (see FallbackCache) or a partial/degraded result. Without a fallback, CircuitOpenError is thrown.
   */
  fallback?: () => Promise<T>;
}

/** Thrown when the circuit is open and no fallback was provided. Maps to `upstream_unavailable`. */
export class CircuitOpenError extends Error {
  readonly breakerName: string;

  constructor(breakerName: string) {
    super(`Circuit "${breakerName}" is open: the dependency is considered unavailable`);
    this.name = 'CircuitOpenError';
    this.breakerName = breakerName;
  }
}

export class CircuitBreaker {
  readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  get state(): CircuitState {
    throw new Error('TODO(area-1): CircuitBreaker.state is not implemented yet');
  }

  async execute<T>(_call: () => Promise<T>, _options: ExecuteOptions<T> = {}): Promise<T> {
    throw new Error('TODO(area-1): CircuitBreaker.execute is not implemented yet');
  }
}
