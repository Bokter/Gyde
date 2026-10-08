import type { ServiceRegistration } from '@gyde/contracts';

import type { RegistryClient } from './registry-client';

export interface RegistrationOptions {
  client: RegistryClient;
  registration: ServiceRegistration;
  /** HEARTBEAT_INTERVAL_MS */
  heartbeatIntervalMs: number;
}

export interface ActiveRegistration {
  /** Stops the heartbeat and deregisters the instance (call it on graceful shutdown). */
  stop(): Promise<void>;
}

/**
 * Registers the instance and keeps it alive with heartbeats until `stop()` is called.
 * Services call it from `startService({ onReady, onShutdown })` in @gyde/service-kit.
 *
 * TODO(area-1): implement.
 */
export async function startRegistration(
  _options: RegistrationOptions,
): Promise<ActiveRegistration> {
  throw new Error('TODO(area-1): startRegistration is not implemented yet');
}
