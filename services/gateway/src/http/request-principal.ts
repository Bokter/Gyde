import { type ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { Principal, RequestContext } from '../application/principal';

/** The slice of the Fastify request the gateway reads and writes. */
export interface GatewayRequest {
  id: string;
  headers: Record<string, string | string[] | undefined>;
  principal?: Principal;
}

/** The authenticated caller, set by `ApiKeyGuard`. */
export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<GatewayRequest>();
  return request.principal;
});

/** The request id that every call to a neighbour carries (`x-request-id`). */
export const CurrentContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => ({
    requestId: ctx.switchToHttp().getRequest<GatewayRequest>().id,
  }),
);
