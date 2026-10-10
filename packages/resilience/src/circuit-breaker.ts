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

/** Internal timeout error used to count slow calls as failures. */
class CallTimeoutError extends Error {
  constructor() {
    super('Call exceeded callTimeoutMs and counts as a failure');
    this.name = 'CallTimeoutError';
  }
}

export class CircuitBreaker {
  readonly options: CircuitBreakerOptions;

  private _state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  /** Timestamps (ms) of every call (success or failure) in the current sliding window. */
  private windowCalls: number[] = [];
  /** Timestamps of failures in the sliding window. */
  private windowFailures: number[] = [];
  /** When the circuit opened (epoch ms). Used to calculate openTimeoutMs. */
  private openedAt = 0;
  /** How many probe calls have been dispatched while half-open. */
  private halfOpenCallCount = 0;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  get state(): CircuitState {
    // Lazily transition open → half-open when enough time has passed.
    if (this._state === 'open' && this.now() - this.openedAt >= this.options.openTimeoutMs) {
      this.transitionTo('half-open');
    }
    return this._state;
  }

  async execute<T>(call: () => Promise<T>, options: ExecuteOptions<T> = {}): Promise<T> {
    const currentState = this.state; // triggers lazy open→half-open transition

    if (currentState === 'open') {
      return this.serveFallback(options.fallback);
    }

    if (currentState === 'half-open') {
      if (this.halfOpenCallCount >= this.options.halfOpenMaxCalls) {
        return this.serveFallback(options.fallback);
      }
      this.halfOpenCallCount++;
    }

    try {
      const result = await this.runWithTimeout(call);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      // If we have a fallback, serve it instead of propagating the error.
      if (options.fallback) {
        return options.fallback();
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private get now(): () => number {
    return this.options.now ?? Date.now;
  }

  private transitionTo(next: CircuitState): void {
    if (this._state === next) return;
    const prev = this._state;
    this._state = next;

    if (next === 'open') {
      this.openedAt = this.now();
      this.halfOpenCallCount = 0;
    } else if (next === 'closed') {
      this.consecutiveFailures = 0;
      this.windowCalls = [];
      this.windowFailures = [];
      this.halfOpenCallCount = 0;
    } else if (next === 'half-open') {
      this.halfOpenCallCount = 0;
    }

    this.options.onStateChange?.({ name: this.options.name, from: prev, to: next });
  }

  private async runWithTimeout<T>(call: () => Promise<T>): Promise<T> {
    const { callTimeoutMs } = this.options;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new CallTimeoutError());
      }, callTimeoutMs);

      call().then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err: unknown) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  private pruneWindow(): void {
    const cutoff = this.now() - this.options.windowMs;
    this.windowCalls = this.windowCalls.filter((t) => t > cutoff);
    this.windowFailures = this.windowFailures.filter((t) => t > cutoff);
  }

  private onSuccess(): void {
    if (this._state === 'half-open') {
      // All probes dispatched succeeded → close the circuit.
      if (this.halfOpenCallCount >= this.options.halfOpenMaxCalls) {
        this.transitionTo('closed');
      }
      // If not all probes are back yet, stay half-open — will close once the last one succeeds.
      return;
    }

    this.consecutiveFailures = 0;
    const ts = this.now();
    this.windowCalls.push(ts);
    this.pruneWindow();
  }

  private onFailure(): void {
    if (this._state === 'half-open') {
      // Any probe failure → go back to open and restart the timer.
      this.transitionTo('open');
      return;
    }

    this.consecutiveFailures++;
    const ts = this.now();
    this.windowCalls.push(ts);
    this.windowFailures.push(ts);
    this.pruneWindow();

    if (this.shouldOpen()) {
      this.transitionTo('open');
    }
  }

  private shouldOpen(): boolean {
    if (this.consecutiveFailures >= this.options.failureThreshold) return true;

    const total = this.windowCalls.length;
    if (total > 0 && this.windowFailures.length / total >= this.options.failureRate) return true;

    return false;
  }

  private async serveFallback<T>(fallback: (() => Promise<T>) | undefined): Promise<T> {
    if (!fallback) throw new CircuitOpenError(this.options.name);
    return fallback();
  }
}
