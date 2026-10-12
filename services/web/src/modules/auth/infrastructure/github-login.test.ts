import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { PGlite } from '@electric-sql/pglite';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdapterAccount, AdapterUser } from 'next-auth/adapters';
import type { GitHubProfile } from 'next-auth/providers/github';
import { resolveMigrationsFolder } from '@/infrastructure/db/database';
import { runMigrations } from '@/infrastructure/db/migrate';
import * as schema from '@/lib/db/schema';
import { CreateTenantOnFirstLogin } from '@/modules/auth/application/create-tenant-on-first-login';
import { DrizzleTenantRepository } from '@/modules/billing/infrastructure/drizzle-tenant-repository';
import { authEvents } from './auth-events';
import { githubProfile } from './github-profile';

// A GitHub profile reduced to what the provider reads. No network, no real credentials.
const profile = {
  id: 4242,
  login: 'Ada-Lovelace',
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  avatar_url: 'https://avatars.example.test/u/4242',
} as GitHubProfile;

const account: AdapterAccount = {
  type: 'oauth',
  userId: '',
  provider: 'github',
  providerAccountId: '4242',
  access_token: 'gho_test_token',
  token_type: 'bearer',
  scope: 'read:user,user:email',
};

describe('first and repeated GitHub login (Auth.js adapter + events over PGlite)', () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  // Same migrations as production; `Database` is driver-agnostic, as in the migration runner.
  const database = db as unknown as Parameters<typeof runMigrations>[0];
  const adapter = DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  });
  const events = authEvents(
    new CreateTenantOnFirstLogin(
      undefined as never,
      new DrizzleTenantRepository(database as never),
    ),
  );

  beforeAll(async () => {
    await runMigrations(database, resolveMigrationsFolder());
  });
  afterAll(async () => {
    await client.close();
  });

  /** The sequence `@auth/core` runs for an OAuth sign-in (lib/actions/callback/handle-login.js). */
  async function signIn() {
    const found = await adapter.getUserByAccount!({
      provider: account.provider,
      providerAccountId: account.providerAccountId,
    });
    let user = found;
    if (!user) {
      const { id: _providerId, ...fromProfile } = githubProfile(profile);
      // The adapter assigns the real id; the placeholder only satisfies the type.
      user = await adapter.createUser!({
        ...fromProfile,
        id: '',
        emailVerified: null,
      } as AdapterUser);
      await events.createUser!({ user });
      await adapter.linkAccount!({ ...account, userId: user.id });
      await events.linkAccount!({ user, account, profile: user });
    }
    await adapter.createSession!({
      sessionToken: crypto.randomUUID(),
      userId: user.id,
      expires: new Date(Date.now() + 60_000),
    });
    return user;
  }

  const rows = async (
    table:
      typeof schema.users | typeof schema.accounts | typeof schema.tenants | typeof schema.sessions,
  ) => (await db.select({ n: count() }).from(table))[0]!.n;

  it('maps the profile onto the columns users requires', () => {
    expect(githubProfile(profile)).toMatchObject({
      githubId: '4242',
      login: 'Ada-Lovelace',
      avatarUrl: 'https://avatars.example.test/u/4242',
      name: 'Ada Lovelace',
      email: 'ada@example.test',
    });
  });

  it('creates the user with github_id and login, the account and exactly one free tenant', async () => {
    const user = await signIn();

    const [stored] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(stored).toMatchObject({ githubId: '4242', login: 'Ada-Lovelace', name: 'Ada Lovelace' });

    const accounts = await db.select().from(schema.accounts);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      userId: user.id,
      provider: 'github',
      providerAccountId: '4242',
    });

    const tenants = await db.select().from(schema.tenants);
    expect(tenants).toHaveLength(1);
    expect(tenants[0]).toMatchObject({ ownerId: user.id, plan: 'free' });
    expect(tenants[0]!.slug).toMatch(/^ada-lovelace-[a-z0-9]+$/);

    expect(await rows(schema.sessions)).toBe(1);
  });

  it('does not duplicate the user, account or tenant on a second login of the same profile', async () => {
    await signIn();

    expect(await rows(schema.users)).toBe(1);
    expect(await rows(schema.accounts)).toBe(1);
    expect(await rows(schema.tenants)).toBe(1);
    expect(await rows(schema.sessions)).toBe(2);
  });
});
