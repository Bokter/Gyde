import type { VerifyApiKeyResponse } from '@gyde/contracts';

import type { RequestContext } from '../principal';

export const API_KEY_VERIFIER = Symbol('ApiKeyVerifier');

/** Asks Web whether an API key is valid (`POST /internal/api-keys/verify`). */
export interface ApiKeyVerifier {
  verify(apiKey: string, context: RequestContext): Promise<VerifyApiKeyResponse>;
}
