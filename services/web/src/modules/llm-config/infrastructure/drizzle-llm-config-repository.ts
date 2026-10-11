import { eq } from 'drizzle-orm';
import type { LlmProvider } from '@gyde/contracts';
import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import type { LlmConfig, LlmConfigStatus, NewLlmConfig } from '../domain/entities';
import type { LlmConfigRepository } from '../application/ports/llm-config-repository';

type Row = typeof schema.llmConfigs.$inferSelect;

export class DrizzleLlmConfigRepository implements LlmConfigRepository {
  async findByTenantId(tenantId: string): Promise<LlmConfig | null> {
    const rows = await db
      .select()
      .from(schema.llmConfigs)
      .where(eq(schema.llmConfigs.tenantId, tenantId))
      .limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async upsert(config: NewLlmConfig): Promise<LlmConfig> {
    const values = {
      tenantId: config.tenantId,
      provider: config.provider,
      model: config.model,
      keyLast4: config.keyLast4,
      kid: config.secret.kid,
      iv: config.secret.iv,
      authTag: config.secret.authTag,
      encryptedKey: config.secret.ciphertext,
      status: config.status,
      lastTestedAt: config.lastTestedAt,
      rotatedAt: config.rotatedAt,
      updatedAt: new Date(),
    };
    const [row] = await db
      .insert(schema.llmConfigs)
      .values(values)
      .onConflictDoUpdate({ target: schema.llmConfigs.tenantId, set: values })
      .returning();
    return toEntity(row!);
  }

  async deleteByTenantId(tenantId: string): Promise<boolean> {
    const deleted = await db
      .delete(schema.llmConfigs)
      .where(eq(schema.llmConfigs.tenantId, tenantId))
      .returning({ id: schema.llmConfigs.id });
    return deleted.length > 0;
  }
}

function toEntity(row: Row): LlmConfig {
  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider as LlmProvider,
    model: row.model,
    keyLast4: row.keyLast4,
    secret: { kid: row.kid, iv: row.iv, authTag: row.authTag, ciphertext: row.encryptedKey },
    status: row.status as LlmConfigStatus,
    lastTestedAt: row.lastTestedAt,
    rotatedAt: row.rotatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
