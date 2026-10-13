import type { ApiKey } from '../domain/entities';

export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

/**
 * What the dashboard is allowed to see about an API key. Built field by field (allow-list) so the
 * hash or any future sensitive column never reaches the browser by accident.
 */
export interface ApiKeyView {
  id: string;
  name: string | null;
  environment: 'live' | 'test';
  prefix: string;
  keyLast4: string;
  status: ApiKeyStatus;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export function apiKeyStatus(apiKey: ApiKey, now: Date): ApiKeyStatus {
  if (apiKey.revokedAt) return 'revoked';
  if (apiKey.expiresAt && apiKey.expiresAt < now) return 'expired';
  return 'active';
}

export function toApiKeyView(apiKey: ApiKey, now: Date = new Date()): ApiKeyView {
  return {
    id: apiKey.id,
    name: apiKey.name,
    environment: apiKey.environment,
    prefix: apiKey.prefix,
    keyLast4: apiKey.keyLast4,
    status: apiKeyStatus(apiKey, now),
    createdAt: apiKey.createdAt.toISOString(),
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    expiresAt: apiKey.expiresAt?.toISOString() ?? null,
    revokedAt: apiKey.revokedAt?.toISOString() ?? null,
  };
}
