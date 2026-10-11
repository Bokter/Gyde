import { DrizzleApiKeyRepository } from './drizzle-api-key-repository';
import { DrizzleTenantRepository } from '@/modules/billing/infrastructure/drizzle-tenant-repository';
import { CreateApiKey } from '@/modules/api-keys/application/create-api-key';
import { ListApiKeys } from '@/modules/api-keys/application/list-api-keys';
import { RevokeApiKey } from '@/modules/api-keys/application/revoke-api-key';
import { VerifyApiKey } from '@/modules/api-keys/application/verify-api-key';
import { API_KEY_REPOSITORY } from '@/modules/api-keys/domain/repositories';
import { TENANT_REPOSITORY } from '@/modules/auth/application/ports/tenant-repository';

const apiKeyRepository = new DrizzleApiKeyRepository();
const tenantRepository = new DrizzleTenantRepository();

export const apiKeyRepositories = {
  [API_KEY_REPOSITORY]: apiKeyRepository,
  [TENANT_REPOSITORY]: tenantRepository,
};

export const createApiKey = new CreateApiKey(apiKeyRepository);
export const listApiKeys = new ListApiKeys(apiKeyRepository, tenantRepository);
export const revokeApiKey = new RevokeApiKey(apiKeyRepository);
export const verifyApiKey = new VerifyApiKey(apiKeyRepository, tenantRepository);
