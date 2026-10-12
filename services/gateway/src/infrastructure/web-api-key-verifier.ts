import { ROUTES, VerifyApiKeyResponse } from '@gyde/contracts';
import type { ResilientHttpClient } from '@gyde/service-kit';

import type { ApiKeyVerifier } from '../application/ports/api-key-verifier';
import type { RequestContext } from '../application/principal';
import { toUpstreamUnavailable } from './upstream-errors';

/** Asks Web to verify the key. The client adds `x-internal-token`; the key is never logged. */
export class WebApiKeyVerifier implements ApiKeyVerifier {
  constructor(private readonly client: ResilientHttpClient) {}

  async verify(apiKey: string, context: RequestContext): Promise<VerifyApiKeyResponse> {
    try {
      const body = await this.client.postJson<unknown>(
        'web',
        ROUTES.web.verifyApiKey,
        { apiKey },
        { requestId: context.requestId },
      );
      return VerifyApiKeyResponse.parse(body);
    } catch (error) {
      throw toUpstreamUnavailable('web', error);
    }
  }
}
