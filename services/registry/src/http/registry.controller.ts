import {
  type InstanceInfo,
  type ResolveResponse,
  ROUTES,
  ServiceRegistration,
} from '@gyde/contracts';
import { ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';

import { DEREGISTER_INSTANCE, type DeregisterInstance } from '../application/deregister-instance';
import { HEARTBEAT_INSTANCE, type HeartbeatInstance } from '../application/heartbeat-instance';
import { REGISTER_INSTANCE, type RegisterInstance } from '../application/register-instance';
import {
  RESOLVE_SERVICE_INSTANCES,
  type ResolveServiceInstances,
} from '../application/resolve-service-instances';
import {
  toInstanceContract,
  toRegisterDto,
  toResolveContract,
  toResolveDto,
} from './mappers/registry.mapper';

/**
 * HTTP surface of the registry. Lives on the internal network only: every `/v1/*` call must
 * carry the internal token, enforced by the service-kit guard.
 */
@Controller()
export class RegistryController {
  constructor(
    @Inject(REGISTER_INSTANCE) private readonly registerInstance: RegisterInstance,
    @Inject(HEARTBEAT_INSTANCE) private readonly heartbeatInstance: HeartbeatInstance,
    @Inject(DEREGISTER_INSTANCE) private readonly deregisterInstance: DeregisterInstance,
    @Inject(RESOLVE_SERVICE_INSTANCES)
    private readonly resolveServiceInstances: ResolveServiceInstances,
  ) {}

  @Post(ROUTES.registry.instances)
  @HttpCode(201)
  async register(
    @Body(new ZodValidationPipe(ServiceRegistration)) body: ServiceRegistration,
  ): Promise<InstanceInfo> {
    return toInstanceContract(await this.registerInstance.execute(toRegisterDto(body)));
  }

  @Put(ROUTES.registry.heartbeat)
  async heartbeat(@Param('instanceId') instanceId: string): Promise<InstanceInfo> {
    return toInstanceContract(await this.heartbeatInstance.execute(instanceId));
  }

  @Delete(ROUTES.registry.instance)
  deregister(@Param('instanceId') instanceId: string) {
    return this.deregisterInstance.execute(instanceId);
  }

  @Get(ROUTES.registry.resolve)
  async resolve(@Param('serviceName') serviceName: string): Promise<ResolveResponse> {
    return toResolveContract(await this.resolveServiceInstances.execute(toResolveDto(serviceName)));
  }
}
