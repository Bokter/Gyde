import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { createTenantOnFirstLogin } from './composition-root';

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: { scope: 'read:user user:email' },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'github' && user.id) {
        return true;
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      await createTenantOnFirstLogin.execute({
        id: user.id,
        githubId: '',
        login: user.name || user.email || 'user',
        name: user.name ?? null,
        email: user.email ?? null,
        avatarUrl: user.image ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    },
    async linkAccount({ user, account }) {
      if (account.provider === 'github' && user.id) {
        await createTenantOnFirstLogin.execute({
          id: user.id,
          githubId: account.providerAccountId,
          login: user.name || user.email || 'user',
          name: user.name ?? null,
          email: user.email ?? null,
          avatarUrl: user.image ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    },
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
  },
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.AUTH_SECRET!,
  trustHost: true,
});
