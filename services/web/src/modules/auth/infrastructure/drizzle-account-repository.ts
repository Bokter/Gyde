import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/lib/db/schema';
import type { Account } from '../domain/entities';
import type { AccountRepository } from '../domain/repositories';

const pool = new Pool({
  connectionString: process.env.WEB_DATABASE_URL,
  max: 10,
});

const db = drizzle(pool, { schema });

export class DrizzleAccountRepository implements AccountRepository {
  async findByProvider(provider: string, providerAccountId: string): Promise<Account | null> {
    const result = await db
      .select()
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.provider, provider),
          eq(schema.accounts.providerAccountId, providerAccountId),
        ),
      )
      .limit(1);
    return this.mapAccount(result[0]) || null;
  }

  async create(account: Omit<Account, 'id'>): Promise<Account> {
    const result = await db
      .insert(schema.accounts)
      .values({
        userId: account.userId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        refresh_token: account.refreshToken,
        access_token: account.accessToken,
        expires_at: account.expiresAt,
        token_type: account.tokenType,
        scope: account.scope,
        id_token: account.idToken,
        session_state: account.sessionState,
      })
      .returning();
    return this.mapAccount(result[0])!;
  }

  async update(id: string, data: Partial<Account>): Promise<Account> {
    const updateData: Record<string, unknown> = {};
    if (data.type !== undefined) updateData.type = data.type;
    if (data.provider !== undefined) updateData.provider = data.provider;
    if (data.providerAccountId !== undefined) updateData.providerAccountId = data.providerAccountId;
    if (data.refreshToken !== undefined) updateData.refresh_token = data.refreshToken;
    if (data.accessToken !== undefined) updateData.access_token = data.accessToken;
    if (data.expiresAt !== undefined) updateData.expires_at = data.expiresAt;
    if (data.tokenType !== undefined) updateData.token_type = data.tokenType;
    if (data.scope !== undefined) updateData.scope = data.scope;
    if (data.idToken !== undefined) updateData.id_token = data.idToken;
    if (data.sessionState !== undefined) updateData.session_state = data.sessionState;

    const result = await db
      .update(schema.accounts)
      .set(updateData)
      .where(eq(schema.accounts.id, id))
      .returning();
    return this.mapAccount(result[0])!;
  }

  async delete(userId: string, provider: string): Promise<void> {
    await db
      .delete(schema.accounts)
      .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.provider, provider)));
  }

  private mapAccount(row: typeof schema.accounts.$inferSelect | undefined): Account | null {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      provider: row.provider,
      providerAccountId: row.providerAccountId,
      refreshToken: row.refresh_token,
      accessToken: row.access_token,
      expiresAt: row.expires_at,
      tokenType: row.token_type,
      scope: row.scope,
      idToken: row.id_token,
      sessionState: row.session_state,
    };
  }
}
