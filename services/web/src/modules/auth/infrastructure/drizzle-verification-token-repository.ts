import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/lib/db/schema';
import type { VerificationToken } from '../domain/entities';
import type { VerificationTokenRepository } from '../domain/repositories';

const pool = new Pool({
  connectionString: process.env.WEB_DATABASE_URL,
  max: 10,
});

const db = drizzle(pool, { schema });

export class DrizzleVerificationTokenRepository implements VerificationTokenRepository {
  async findByToken(token: string): Promise<VerificationToken | null> {
    const result = await db
      .select()
      .from(schema.verificationTokens)
      .where(eq(schema.verificationTokens.token, token))
      .limit(1);
    return this.mapToken(result[0]) || null;
  }

  async create(token: VerificationToken): Promise<VerificationToken> {
    await db.insert(schema.verificationTokens).values({
      identifier: token.identifier,
      token: token.token,
      expires: token.expires,
    });
    return token;
  }

  async delete(identifier: string, token: string): Promise<void> {
    await db
      .delete(schema.verificationTokens)
      .where(
        and(
          eq(schema.verificationTokens.identifier, identifier),
          eq(schema.verificationTokens.token, token),
        ),
      );
  }

  private mapToken(
    row: typeof schema.verificationTokens.$inferSelect | undefined,
  ): VerificationToken | null {
    if (!row) return null;
    return {
      identifier: row.identifier,
      token: row.token,
      expires: row.expires,
    };
  }
}
