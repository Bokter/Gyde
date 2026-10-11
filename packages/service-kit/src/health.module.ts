import { Controller, type DynamicModule, Get, Inject, Module, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { HEALTH_OPTIONS } from './tokens';

export interface HealthOptions {
  /** Service name, e.g. "gateway". */
  name: string;
  version: string;
  /** Readiness checks (database, registry…): `/readyz` answers 503 while any of them fails. */
  readiness: Record<string, () => Promise<unknown>>;
}

@Controller()
class HealthController {
  private readonly startedAt = Date.now();

  constructor(@Inject(HEALTH_OPTIONS) private readonly options: HealthOptions) {}

  @Get('healthz')
  liveness() {
    return {
      status: 'ok',
      service: this.options.name,
      version: this.options.version,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
    };
  }

  @Get('readyz')
  async readiness(@Res({ passthrough: true }) reply: FastifyReply) {
    const checks: Record<string, 'ok' | 'failed'> = {};
    await Promise.all(
      Object.entries(this.options.readiness).map(async ([check, run]) => {
        try {
          await run();
          checks[check] = 'ok';
        } catch {
          checks[check] = 'failed';
        }
      }),
    );
    const ready = Object.values(checks).every((result) => result === 'ok');
    void reply.status(ready ? 200 : 503);
    return { status: ready ? 'ready' : 'not_ready', service: this.options.name, checks };
  }
}

/** `/healthz` (liveness) and `/readyz` (readiness). `createService` imports it for every service. */
@Module({})
export class HealthModule {
  static register(options: HealthOptions): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [{ provide: HEALTH_OPTIONS, useValue: options }],
    };
  }
}
