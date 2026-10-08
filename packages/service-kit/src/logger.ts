import { type DestinationStream, type Logger, pino } from 'pino';

/**
 * Anything that can hold a secret is censored before it reaches a log line. This matters most for
 * BYOK: a studio's LLM key must never be written to logs, not even by mistake in a debug call.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-internal-token"]',
  'headers.authorization',
  'headers["x-internal-token"]',
  'authorization',
  'apiKey',
  'password',
  'secret',
  'token',
  ...['authorization', 'apiKey', 'api_key', 'password', 'secret', 'token', 'accessToken'].flatMap(
    (key) => [`*.${key}`, `*.*.${key}`],
  ),
];

export interface LoggerOptions {
  name: string;
  level?: string;
  /** Only for tests: capture the output instead of writing to stdout. */
  destination?: DestinationStream;
}

export function createLogger({ name, level = 'info', destination }: LoggerOptions): Logger {
  return pino(
    {
      name,
      level,
      base: { service: name },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    },
    destination,
  );
}

export type { Logger };
