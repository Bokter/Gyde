import { randomUUID } from 'node:crypto';

import type { ServiceName, ServiceRegistration } from '@gyde/contracts';
import { type ActiveRegistration, RegistryClient, startRegistration } from '@gyde/discovery';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import { APP_CONFIG, SERVICE_METADATA } from './tokens';

export interface ServiceRegistrationOptions {
  serviceName: ServiceName;
  instanceId?: string;
  baseUrl: string;
  version?: string;
  metadata?: Record<string, string>;
  registryUrl?: string;
  internalToken?: string;
  heartbeatIntervalMs?: number;
  client?: RegistryClient;
}

export interface StartOptions {
  port: number;
  host?: string;
  /** Runs once the server is listening (e.g. custom startup logic). */
  onReady?: () => Promise<void>;
  /** Runs before the server closes (e.g. flush, close connection pools). */
  onShutdown?: () => Promise<void>;
  /**
   * Auto-registration with the Service Registry.
   * If true or omitted, reads registration variables from configuration / env.
   * Set to `false` to disable auto-registration (e.g. for the registry service itself).
   */
  registration?: boolean | ServiceRegistrationOptions;
}

/** Starts listening and installs graceful shutdown with auto-registration in the Service Registry. */
export async function startService(
  app: NestFastifyApplication,
  options: StartOptions,
): Promise<void> {
  const { port, host = '0.0.0.0', onReady, onShutdown, registration } = options;
  const log = app.getHttpAdapter().getInstance().log;

  await app.listen(port, host);

  let activeRegistration: ActiveRegistration | null = null;

  if (registration !== false) {
    try {
      const config = (app.get(APP_CONFIG, { strict: false }) ?? {}) as Record<string, unknown>;
      const metadata = (app.get(SERVICE_METADATA, { strict: false }) ?? {}) as {
        name?: string;
        version?: string;
      };

      const explicit = typeof registration === 'object' ? registration : undefined;

      const serviceName = (explicit?.serviceName ??
        metadata.name ??
        config['SERVICE_NAME'] ??
        process.env['SERVICE_NAME']) as ServiceName | undefined;

      // The registry itself never self-registers
      if (serviceName && serviceName !== ('registry' as ServiceName)) {
        const baseUrl =
          explicit?.baseUrl ??
          (config['SERVICE_BASE_URL'] as string | undefined) ??
          process.env['SERVICE_BASE_URL'];

        const registryUrl =
          explicit?.registryUrl ??
          (config['REGISTRY_URL'] as string | undefined) ??
          process.env['REGISTRY_URL'];

        const internalToken =
          explicit?.internalToken ??
          (config['INTERNAL_SERVICE_TOKEN'] as string | undefined) ??
          process.env['INTERNAL_SERVICE_TOKEN'];

        if (!baseUrl || (!explicit?.client && (!registryUrl || !internalToken))) {
          const missing = [
            !baseUrl && 'SERVICE_BASE_URL',
            !explicit?.client && !registryUrl && 'REGISTRY_URL',
            !explicit?.client && !internalToken && 'INTERNAL_SERVICE_TOKEN',
          ]
            .filter(Boolean)
            .join(', ');
          log.warn(
            { serviceName, missing },
            'auto-registration skipped: missing required variables',
          );
        } else {
          const instanceId =
            explicit?.instanceId ??
            (config['INSTANCE_ID'] as string | undefined) ??
            process.env['INSTANCE_ID'] ??
            `${serviceName}-${randomUUID().slice(0, 8)}`;

          const version =
            explicit?.version ??
            metadata.version ??
            (config['SERVICE_VERSION'] as string | undefined) ??
            '0.0.0';

          const heartbeatIntervalMs =
            explicit?.heartbeatIntervalMs ??
            Number(
              config['HEARTBEAT_INTERVAL_MS'] ?? process.env['HEARTBEAT_INTERVAL_MS'] ?? 10_000,
            );

          const client =
            explicit?.client ??
            new RegistryClient({
              registryUrl: registryUrl!,
              internalToken: internalToken!,
            });

          const regPayload: ServiceRegistration = {
            serviceName,
            instanceId,
            baseUrl,
            version,
            metadata: explicit?.metadata ?? {},
          };

          activeRegistration = await startRegistration({
            client,
            registration: regPayload,
            heartbeatIntervalMs,
          });

          log.info({ serviceName, instanceId, baseUrl }, 'registered in service registry');
        }
      }
    } catch (error) {
      log.warn({ err: error }, 'failed to auto-register in service registry');
    }
  }

  let closing = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    log.info({ signal }, 'shutting down');
    try {
      await onShutdown?.();
      if (activeRegistration) {
        await activeRegistration.stop().catch((err) => {
          log.warn({ err }, 'error while deregistering from registry');
        });
      }
      await app.close();
      process.exit(0);
    } catch (error) {
      log.error({ err: error }, 'error while shutting down');
      process.exit(1);
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  await onReady?.();
}
