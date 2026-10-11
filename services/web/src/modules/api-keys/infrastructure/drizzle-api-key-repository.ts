import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/lib/db/schema';
import type { ApiKey } from '../domain/entities';
import type { ApiKeyRepository } from '../domain/repositories';

const pool = new Pool({
  connectionString: process.env.WEB_DATABASE_URL,
  max: 10,
});

const db = drizzle(pool, { schema });

export class DrizzleApiKeyRepository implements ApiKeyRepository {
  async findByTenantId(tenantId: string): Promise<ApiKey[]> {
    const result = await db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.tenantId, tenantId))
      .orderBy(schema.apiKeys.createdAt);
    return result.map(this.mapApiKey);
  }

  async findById(id: string): Promise<ApiKey | null> {
    const result = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, id)).limit(1);
    return result[0] ? this.mapApiKey(result[0]) : null;
  }

  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    const result = await db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.keyHash, keyHash))
      .limit(1);
    return result[0] ? this.mapApiKey(result[0]) : null;
  }

  async create(apiKey: Omit<ApiKey, 'createdAt'>): Promise<ApiKey> {
    const result = await db
      .insert(schema.apiKeys)
      .values({
        id: apiKey.id,
        tenantId: apiKey.tenantId,
        prefix: apiKey.prefix,
        keyHash: apiKey.keyHash,
        keyLast4: apiKey.keyLast4,
        name: apiKey.name,
        environment: apiKey.environment,
        expiresAt: apiKey.expiresAt,
        revokedAt: apiKey.revokedAt,
        lastUsedAt: apiKey.lastUsedAt,
      })
      .returning();
    return this.mapApiKey(result[0]!);
  }

  async update(id: string, data: Partial<ApiKey>): Promise<ApiKey> {
    const updateData: Record<string, unknown> = {};
    if (data.prefix !== undefined) updateData.prefix = data.prefix;
    if (data.keyHash !== undefined) updateData.keyHash = data.keyHash;
    if (data.keyLast4 !== undefined) updateData.keyLast4 = data.keyLast4;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.environment !== undefined) updateData.environment = data.environment;
    if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt;
    if (data.revokedAt !== undefined) updateData.revokedAt = data.revokedAt;
    if (data.lastUsedAt !== undefined) updateData.lastUsedAt = data.lastUsedAt;

    const result = await db
      .update(schema.apiKeys)
      .set(updateData)
      .where(eq(schema.apiKeys.id, id))
      .returning();
    return this.mapApiKey(result[0]!);
  }

  async revoke(id: string): Promise<void> {
    await db.update(schema.apiKeys).set({ revokedAt: new Date() }).where(eq(schema.apiKeys.id, id));
  }

  async updateLastUsedAt(id: string): Promise<void> {
    await db
      .update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, id));
  }

  private mapApiKey(row: typeof schema.apiKeys.$inferSelect): ApiKey {
    return {
      id: row.id,
      tenantId: row.tenantId,
      prefix: row.prefix,
      keyHash: row.keyHash,
      keyLast4: row.keyLast4,
      name: row.name,
      environment: row.environment as 'live' | 'test',
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
    };
  }
}
