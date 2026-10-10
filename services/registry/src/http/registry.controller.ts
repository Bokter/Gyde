import { ROUTES, ServiceRegistration } from '@gyde/contracts';
import { notImplemented, ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';

/**
 * HTTP surface of the registry. It lives on the internal network only: every `/v1/*` call must
 * carry the internal token (see `createApp`), so nothing outside our own services can register or
 * resolve.
 *
 * Every method answers `501 not_implemented` (and already validates its body) until you replace
 * `notImplemented(...)` with a call to a use case injected with `@Inject(UseCase)`.
 */
@Controller()
export class RegistryController {
  @Post(ROUTES.registry.instances)
  register(@Body(new ZodValidationPipe(ServiceRegistration)) _body: ServiceRegistration): never {
    return notImplemented('POST', ROUTES.registry.instances);
  }

  @Delete(ROUTES.registry.instance)
  deregister(): never {
    return notImplemented('DELETE', ROUTES.registry.instance);
  }

  @Put(ROUTES.registry.heartbeat)
  heartbeat(): never {
    return notImplemented('PUT', ROUTES.registry.heartbeat);
  }

  @Get(ROUTES.registry.resolve)
  resolve(): never {
    return notImplemented('GET', ROUTES.registry.resolve);
  }
}
