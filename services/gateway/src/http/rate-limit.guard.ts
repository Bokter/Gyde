import { HttpError } from '@gyde/service-kit';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';

import { EnforceRateLimitUseCase } from '../application/use-cases/enforce-rate-limit.use-case';
import type { GatewayRequest } from './request-principal';

interface HeaderReply {
  header(name: string, value: string): unknown;
}

/**
 * Limits the requests of each API key. It runs after `ApiKeyGuard`, so it only ever sees callers
 * that are already identified: requests with a bad key are refused earlier and are not counted.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(@Inject(EnforceRateLimitUseCase) private readonly enforce: EnforceRateLimitUseCase) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const principal = http.getRequest<GatewayRequest>().principal;
    if (!principal) throw new HttpError('unauthorized', 'Missing or invalid API key');

    const decision = this.enforce.execute(principal);
    if (!decision.allowed) {
      http.getResponse<HeaderReply>().header('retry-after', String(decision.retryAfterSeconds));
      throw new HttpError('rate_limited', 'Too many requests: slow down and retry later');
    }
    return true;
  }
}
