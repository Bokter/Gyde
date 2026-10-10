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
 */
export async function startRegistration(options: RegistrationOptions): Promise<ActiveRegistration> {
  const { client, registration, heartbeatIntervalMs } = options;

  let timer: ReturnType<typeof setInterval> | null = null;
  let isStopped = false;

  const registerWithRetry = async () => {
    let delay = 1000;
    while (!isStopped) {
      try {
        await client.register(registration);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 10000);
      }
    }
  };

  await registerWithRetry();

  if (!isStopped) {
    timer = setInterval(async () => {
      if (isStopped) return;
      try {
        await client.heartbeat(registration.instanceId);
      } catch {
        // Heartbeat failed (e.g. 404) -> re-register
        await client.register(registration).catch(() => {});
      }
    }, heartbeatIntervalMs);
  }

  return {
    async stop() {
      isStopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      await client.deregister(registration.instanceId).catch(() => {});
    },
  };
}
