import type { FastifyInstance } from 'fastify';

export interface StartOptions {
  port: number;
  host?: string;
  /** Runs once the server is listening (e.g. register in the Service Registry). */
  onReady?: () => Promise<void>;
  /** Runs before the server closes (e.g. deregister, flush, close connection pools). */
  onShutdown?: () => Promise<void>;
}

/** Starts listening and installs a graceful shutdown for SIGTERM / SIGINT. */
export async function startService(app: FastifyInstance, options: StartOptions): Promise<void> {
  const { port, host = '0.0.0.0', onReady, onShutdown } = options;

  await app.listen({ port, host });

  let closing = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    try {
      await onShutdown?.();
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'error while shutting down');
      process.exit(1);
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  await onReady?.();
}
