import type { LlmProvider } from '@gyde/contracts';

/** Providers a studio can register today: only the ones llm-analysis can actually call. */
export const SUPPORTED_LLM_PROVIDERS: readonly LlmProvider[] = ['anthropic', 'gemini'];

/** AES-256-GCM output, all binary parts base64-encoded. `kid` names the master key used. */
export interface EncryptedSecret {
  kid: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export type LlmConfigStatus = 'active' | 'invalid';

export interface LlmConfig {
  id: string;
  tenantId: string;
  provider: LlmProvider;
  model: string;
  keyLast4: string;
  secret: EncryptedSecret;
  status: LlmConfigStatus;
  lastTestedAt: Date | null;
  rotatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewLlmConfig = Omit<LlmConfig, 'id' | 'createdAt' | 'updatedAt'>;
