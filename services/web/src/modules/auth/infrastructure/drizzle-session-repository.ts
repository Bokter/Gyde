import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/lib/db/schema';
import type { Session } from '../domain/entities';
import type { SessionRepository } from '../domain/repositories';

const pool = new Pool({
  connectionString: process.env.WEB_DATABASE_URL,
  max: 10,
});

const db = drizzle(pool, { schema });

export class DrizzleSessionRepository implements SessionRepository {
  async findByToken(token: string): Promise<Session | null> {
    const result = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.sessionToken, token))
      .limit(1);
    return this.mapSession(result[0]) || null;
  }

  async create(session: Session): Promise<Session> {
    await db.insert(schema.sessions).values({
      sessionToken: session.sessionToken,
      userId: session.userId,
      expires: session.expires,
    });
    return session;
  }

  async delete(token: string): Promise<void> {
    await db.delete(schema.sessions).where(eq(schema.sessions.sessionToken, token));
  }

  async deleteByUserId(userId: string): Promise<void> {
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  }

  private mapSession(row: typeof schema.sessions.$inferSelect | undefined): Session | null {
    if (!row) return null;
    return {
      sessionToken: row.sessionToken,
      userId: row.userId,
      expires: row.expires,
    };
  }
}
