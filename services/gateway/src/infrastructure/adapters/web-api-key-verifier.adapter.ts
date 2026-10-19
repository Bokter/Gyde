import { ROUTES, VerifyApiKeyResponse } from '@gyde/contracts';
import type { ResilientHttpClient } from '@gyde/service-kit';

import type { ApiKeyVerificationDto } from '../../application/dto/gateway.dto';
import type { ApiKeyVerifier } from '../../application/ports/api-key-verifier';
import type { RequestContext } from '../../application/request-context';
import { toApiKeyVerificationDto } from '../mappers/gateway.mapper';
import { toUpstreamUnavailable } from '../upstream-errors';

/** Asks Web to verify the key. The client adds `x-internal-token`; the key is never logged. */
export class WebApiKeyVerifier implements ApiKeyVerifier {
  constructor(private readonly client: ResilientHttpClient) {}

  async verify(apiKey: string, context: RequestContext): Promise<ApiKeyVerificationDto> {
    try {
      const body = await this.client.postJson<unknown>(
        'web',
        ROUTES.web.verifyApiKey,
        { apiKey },
        { requestId: context.requestId },
      );
      return toApiKeyVerificationDto(VerifyApiKeyResponse.parse(body));
    } catch (error) {
      throw toUpstreamUnavailable('web', error);
    }
  }
}
