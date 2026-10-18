import type {
  InstanceInfo,
  ResolveResponse,
  ServiceName,
  ServiceRegistration,
} from '@gyde/contracts';

import type {
  InstanceDto,
  RegisterInstanceDto,
  ResolveResultDto,
  ResolveServiceDto,
} from '../../application/dto/registry.dto';

export function toRegisterDto(contract: ServiceRegistration): RegisterInstanceDto {
  return {
    instanceId: contract.instanceId,
    serviceName: contract.serviceName,
    baseUrl: contract.baseUrl,
    version: contract.version,
    metadata: contract.metadata,
  };
}

/**
 * The route param is not validated (a unknown name resolves to an empty list, not a 400), so
 * the cast is deliberate: validating it would change the observed response.
 */
export function toResolveDto(serviceName: string): ResolveServiceDto {
  return { serviceName: serviceName as ServiceName };
}

export function toInstanceContract(dto: InstanceDto): InstanceInfo {
  return {
    instanceId: dto.instanceId,
    serviceName: dto.serviceName,
    baseUrl: dto.baseUrl,
    version: dto.version,
    healthy: dto.healthy,
    registeredAt: dto.registeredAt,
    lastHeartbeatAt: dto.lastHeartbeatAt,
  };
}

export function toResolveContract(dto: ResolveResultDto): ResolveResponse {
  return {
    serviceName: dto.serviceName,
    instances: dto.instances.map(toInstanceContract),
  };
}
