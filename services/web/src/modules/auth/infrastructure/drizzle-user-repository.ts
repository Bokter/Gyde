import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/lib/db/schema';
import type { User } from '../domain/entities';
import type { UserRepository } from '../domain/repositories';

const pool = new Pool({
  connectionString: process.env.WEB_DATABASE_URL,
  max: 10,
});

const db = drizzle(pool, { schema });

export class DrizzleUserRepository implements UserRepository {
  async findByGithubId(githubId: string): Promise<User | null> {
    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.githubId, githubId))
      .limit(1);
    return this.mapUser(result[0]) || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return this.mapUser(result[0]) || null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return this.mapUser(result[0]) || null;
  }

  async create(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    const result = await db
      .insert(schema.users)
      .values({
        id: user.id,
        githubId: user.githubId,
        login: user.login,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      })
      .returning();
    return this.mapUser(result[0])!;
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const result = await db
      .update(schema.users)
      .set(data)
      .where(eq(schema.users.id, id))
      .returning();
    return this.mapUser(result[0])!;
  }

  private mapUser(row: typeof schema.users.$inferSelect | undefined): User | null {
    if (!row) return null;
    return {
      id: row.id,
      githubId: row.githubId,
      login: row.login,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatarUrl,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
