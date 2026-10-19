import type { ApiKeyVerificationDto } from '../dto/gateway.dto';
import type { RequestContext } from '../request-context';

export const API_KEY_VERIFIER = Symbol('ApiKeyVerifier');

/** Asks Web whether an API key is valid (`POST /internal/api-keys/verify`). */
export interface ApiKeyVerifier {
  verify(apiKey: string, context: RequestContext): Promise<ApiKeyVerificationDto>;
}
