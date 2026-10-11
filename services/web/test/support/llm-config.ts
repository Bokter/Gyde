import { randomBytes, randomUUID } from 'node:crypto';
import type { LlmConfig, NewLlmConfig } from '@/modules/llm-config/domain/entities';
import type { LlmConfigRepository } from '@/modules/llm-config/application/ports/llm-config-repository';
import type { LlmConnectionTester } from '@/modules/llm-config/application/ports/llm-connection-tester';
import { GetInternalLlmConfig } from '@/modules/llm-config/application/get-internal-llm-config';
import { GetLlmConfigView } from '@/modules/llm-config/application/get-llm-config-view';
import { RevokeLlmConfig } from '@/modules/llm-config/application/revoke-llm-config';
import { SaveLlmConfig } from '@/modules/llm-config/application/save-llm-config';
import { AesGcmLlmKeyCipher } from '@/modules/llm-config/infrastructure/aes-gcm-llm-key-cipher';
import type { LlmConfigModule } from '@/modules/llm-config/infrastructure/composition-root';

export class InMemoryLlmConfigRepository implements LlmConfigRepository {
  readonly rows = new Map<string, LlmConfig>();

  async findByTenantId(tenantId: string) {
    return this.rows.get(tenantId) ?? null;
  }

  async upsert(config: NewLlmConfig) {
    const previous = this.rows.get(config.tenantId);
    const now = new Date();
    const row: LlmConfig = {
      ...config,
      id: previous?.id ?? randomUUID(),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    this.rows.set(config.tenantId, row);
    return row;
  }

  async deleteByTenantId(tenantId: string) {
    return this.rows.delete(tenantId);
  }
}

/** The real use cases and cipher over an in-memory repository and a swappable tester. */
export function buildLlmConfigModule(
  tester: LlmConnectionTester,
  tenantIdForUser: LlmConfigModule['tenantIdForUser'] = async () => null,
) {
  const repository = new InMemoryLlmConfigRepository();
  const cipher = AesGcmLlmKeyCipher.fromConfig(`k1:${randomBytes(32).toString('base64')}`, 'k1');
  const module: LlmConfigModule = {
    save: new SaveLlmConfig(repository, cipher, tester),
    view: new GetLlmConfigView(repository),
    revoke: new RevokeLlmConfig(repository),
    internal: new GetInternalLlmConfig(repository, cipher),
    tenantIdForUser,
  };
  return { module, repository };
}
