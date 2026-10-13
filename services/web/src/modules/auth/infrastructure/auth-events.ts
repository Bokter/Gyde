import type { NextAuthConfig, User as AuthJsUser } from 'next-auth';
import type { AdapterUser } from 'next-auth/adapters';
import type { CreateTenantOnFirstLogin } from '@/modules/auth/application/create-tenant-on-first-login';
import type { User } from '@/modules/auth/domain/entities';

type AuthUser = AuthJsUser | AdapterUser;

function toDomainUser(user: AuthUser, githubId: string): User | null {
  if (!user.id) return null;
  const login = user.login || user.name || user.email || 'user';
  const now = new Date();
  return {
    id: user.id,
    githubId: user.githubId || githubId,
    login,
    name: user.name ?? null,
    email: user.email ?? null,
    avatarUrl: user.avatarUrl ?? user.image ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Both events end in the same call: `CreateTenantOnFirstLogin` is idempotent per owner, so a
 * user gets exactly one free tenant whichever event arrives first (and the unique index on
 * `tenants.owner_id` backs it up). The slug is built from the real GitHub login.
 */
export function authEvents(
  createTenantOnFirstLogin: Pick<CreateTenantOnFirstLogin, 'execute'>,
): NonNullable<NextAuthConfig['events']> {
  return {
    async createUser({ user }) {
      const domainUser = toDomainUser(user, '');
      if (domainUser) await createTenantOnFirstLogin.execute(domainUser);
    },
    async linkAccount({ user, account }) {
      if (account.provider !== 'github') return;
      const domainUser = toDomainUser(user, account.providerAccountId);
      if (domainUser) await createTenantOnFirstLogin.execute(domainUser);
    },
  };
}
