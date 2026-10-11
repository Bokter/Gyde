import { DrizzleUserRepository } from './drizzle-user-repository';
import { DrizzleAccountRepository } from './drizzle-account-repository';
import { DrizzleSessionRepository } from './drizzle-session-repository';
import { DrizzleVerificationTokenRepository } from './drizzle-verification-token-repository';
import { DrizzleTenantRepository } from '@/modules/billing/infrastructure/drizzle-tenant-repository';
import { CreateTenantOnFirstLogin } from '@/modules/auth/application/create-tenant-on-first-login';
import {
  AUTH_REPOSITORY,
  ACCOUNT_REPOSITORY,
  SESSION_REPOSITORY,
  VERIFICATION_TOKEN_REPOSITORY,
} from '@/modules/auth/domain/repositories';
import { TENANT_REPOSITORY } from '@/modules/auth/application/ports/tenant-repository';

const userRepository = new DrizzleUserRepository();
const accountRepository = new DrizzleAccountRepository();
const sessionRepository = new DrizzleSessionRepository();
const verificationTokenRepository = new DrizzleVerificationTokenRepository();
const tenantRepository = new DrizzleTenantRepository();

export const authRepositories = {
  [AUTH_REPOSITORY]: userRepository,
  [ACCOUNT_REPOSITORY]: accountRepository,
  [SESSION_REPOSITORY]: sessionRepository,
  [VERIFICATION_TOKEN_REPOSITORY]: verificationTokenRepository,
  [TENANT_REPOSITORY]: tenantRepository,
};

export const createTenantOnFirstLogin = new CreateTenantOnFirstLogin(
  userRepository,
  tenantRepository,
);
