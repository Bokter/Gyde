import pino, { type DestinationStream, type Logger } from 'pino';

/**
 * Same censored fields as `@gyde/service-kit` (imported there with NestJS, so not reusable from
 * Next), plus the web-only names that can hold a BYOK key or an API key in clear.
 */
const SECRET_KEYS = [
  'authorization',
  'apiKey',
  'api_key',
  'password',
  'secret',
  'token',
  'accessToken',
  'plainKey',
  'encryptedKey',
];

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-internal-token"]',
  'headers.authorization',
  'headers["x-internal-token"]',
  ...SECRET_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
];

export function createLogger(name: string, destination?: DestinationStream): Logger {
  return pino(
    {
      name,
      level: process.env.LOG_LEVEL || 'info',
      base: { service: `web:${name}` },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    },
    destination,
  );
}

export type { Logger };
