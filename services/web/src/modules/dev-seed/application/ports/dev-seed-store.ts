import type { Plan } from '@gyde/contracts';

export interface DevSeedTenant {
  id: string;
  slug: string;
  plan: Plan;
}

export interface NewDevSeed {
  owner: { githubId: string; login: string; name: string };
  tenant: { name: string; slug: string; plan: Plan };
  apiKey: {
    name: string;
    environment: 'test';
    prefix: string;
    keyHash: string;
    keyLast4: string;
  };
}

export interface DevSeedStore {
  findTenantBySlug(slug: string): Promise<DevSeedTenant | null>;
  /** Owner, tenant and API key in one transaction: a tenant never exists without its key. */
  createTenantWithApiKey(seed: NewDevSeed): Promise<{ tenantId: string; apiKeyId: string }>;
}
