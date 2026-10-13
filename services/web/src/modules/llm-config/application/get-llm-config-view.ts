import type { LlmProviderConfigView } from '@gyde/contracts';
import { toLlmConfigView } from './llm-config-view';
import type { LlmConfigRepository } from './ports/llm-config-repository';

export class GetLlmConfigView {
  constructor(private readonly repository: LlmConfigRepository) {}

  async execute(tenantId: string): Promise<LlmProviderConfigView | null> {
    const config = await this.repository.findByTenantId(tenantId);
    return config ? toLlmConfigView(config) : null;
  }
}
