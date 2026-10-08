import { z } from 'zod';

import { Id, IsoDateTime } from './common';

/** Services that register themselves in the Service Registry. */
export const ServiceName = z.enum([
  'gateway',
  'web',
  'normalization',
  'retrieval',
  'llm-analysis',
  'reports',
]);
export type ServiceName = z.infer<typeof ServiceName>;

/** Body of POST /v1/instances (a service instance announcing itself). */
export const ServiceRegistration = z.strictObject({
  serviceName: ServiceName,
  instanceId: Id,
  baseUrl: z.url(),
  version: z.string().min(1).max(30),
  metadata: z.record(z.string(), z.string()).default({}),
});
export type ServiceRegistration = z.infer<typeof ServiceRegistration>;

export const InstanceInfo = z.strictObject({
  instanceId: Id,
  serviceName: ServiceName,
  baseUrl: z.url(),
  version: z.string(),
  healthy: z.boolean(),
  registeredAt: IsoDateTime,
  lastHeartbeatAt: IsoDateTime,
});
export type InstanceInfo = z.infer<typeof InstanceInfo>;

/** Response of GET /v1/services/:serviceName. Only healthy instances are listed. */
export const ResolveResponse = z.strictObject({
  serviceName: ServiceName,
  instances: z.array(InstanceInfo),
});
export type ResolveResponse = z.infer<typeof ResolveResponse>;
