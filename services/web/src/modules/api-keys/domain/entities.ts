export interface ApiKey {
  id: string;
  tenantId: string;
  prefix: string;
  keyHash: string;
  keyLast4: string;
  name: string | null;
  environment: 'live' | 'test';
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyWithPlain {
  apiKey: ApiKey;
  plainKey: string; // Only returned once on creation
}
