import type { ServiceName } from '../../domain/entities/service-instance.entity';

export type RegisterInstanceDto = {
  readonly instanceId: string;
  readonly serviceName: ServiceName;
  readonly baseUrl: string;
  readonly version: string;
  readonly metadata: Readonly<Record<string, string>>;
};

export type InstanceDto = {
  readonly instanceId: string;
  readonly serviceName: ServiceName;
  readonly baseUrl: string;
  readonly version: string;
  readonly healthy: boolean;
  readonly registeredAt: string;
  readonly lastHeartbeatAt: string;
};

export type ResolveServiceDto = {
  readonly serviceName: ServiceName;
};

export type ResolveResultDto = {
  readonly serviceName: ServiceName;
  readonly instances: readonly InstanceDto[];
};

export type DeregisterResultDto = {
  readonly ok: true;
};
