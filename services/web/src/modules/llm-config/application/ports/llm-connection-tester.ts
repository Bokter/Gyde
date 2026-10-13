import type { LlmProviderConfigInput } from '@gyde/contracts';
import type { ConnectionTestFailure } from '../../domain/errors';

export type ConnectionTestResult = { ok: true } | { ok: false; reason: ConnectionTestFailure };

/** Checks a key against its provider before it is stored. Must never log or echo the key. */
export interface LlmConnectionTester {
  test(config: LlmProviderConfigInput): Promise<ConnectionTestResult>;
}
