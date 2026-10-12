import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { createTenantOnFirstLogin } from './composition-root';
import { authEvents } from './auth-events';
import { githubProfile } from './github-profile';

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
      profile: githubProfile,
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
  events: authEvents(createTenantOnFirstLogin),
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
