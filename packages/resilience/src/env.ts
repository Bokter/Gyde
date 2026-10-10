/**
 * Factory that reads the CB_* environment variables and builds a CircuitBreakerOptions object.
 * Use this in `main.ts` or `startService` to get a ready-to-use breaker without duplicating env
 * parsing across services.
 *
 * Usage:
 *   const breaker = new CircuitBreaker(createBreakerFromEnv('gateway->reports'));
 */

import { type CircuitBreakerOptions } from './circuit-breaker';

/**
 * Reads CB_* variables from `env` (defaults to process.env) and returns a fully-populated
 * CircuitBreakerOptions. The `name` parameter identifies the dependency being wrapped
 * (e.g. "gateway->reports" or "llm:tenant-42:openai").
 */
export function createBreakerFromEnv(
  name: string,
  env: Record<string, string | undefined> = process.env,
): CircuitBreakerOptions {
  return {
    name,
    failureThreshold: parsePositiveInt(env['CB_FAILURE_THRESHOLD'], 5),
    failureRate: parsePositiveFloat(env['CB_FAILURE_RATE'], 0.5),
    windowMs: parsePositiveInt(env['CB_WINDOW_MS'], 30_000),
    openTimeoutMs: parsePositiveInt(env['CB_OPEN_TIMEOUT_MS'], 15_000),
    halfOpenMaxCalls: parsePositiveInt(env['CB_HALF_OPEN_MAX_CALLS'], 2),
    callTimeoutMs: parsePositiveInt(env['CB_CALL_TIMEOUT_MS'], 10_000),
  };
}

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value.trim() === '') return defaultValue;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

function parsePositiveFloat(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value.trim() === '') return defaultValue;
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : defaultValue;
}
