import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';

import { AuthenticateApiKeyUseCase } from '../application/use-cases/authenticate-api-key.use-case';
import { translateApplicationError } from './application-error.interceptor';
import type { GatewayRequest } from './request-principal';

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Requires `Authorization: Bearer <API key>` on a route and leaves the caller on the request.
 * The header value is never logged or put in an error.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject(AuthenticateApiKeyUseCase) private readonly authenticate: AuthenticateApiKeyUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    const header = request.headers.authorization;
    const apiKey = typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined;
    try {
      request.principal = await this.authenticate.execute(apiKey, { requestId: request.id });
    } catch (error) {
      // Guards run before interceptors: the application error is translated here.
      throw translateApplicationError(error);
    }
    return true;
  }
}
