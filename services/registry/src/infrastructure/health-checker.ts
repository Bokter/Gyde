import { Injectable } from '@nestjs/common';

import type { RegistryRepository } from '../application/ports/registry-repository';

export interface HealthCheckerOptions {
  intervalMs: number;
  maxFailures: number;
  instanceTtlMs: number;
  fetch?: typeof fetch;
  now?: () => number;
}

export const HEALTH_CHECKER = Symbol('HealthChecker');

@Injectable()
export class HealthChecker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly options: HealthCheckerOptions;
  private readonly repository: RegistryRepository;

  constructor(repository: RegistryRepository, options: HealthCheckerOptions) {
    this.repository = repository;
    this.options = options;
  }

  private get fetchFn(): typeof fetch {
    return this.options.fetch ?? globalThis.fetch;
  }

  private get now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  async runOnce(): Promise<void> {
    // 1. Drop instances whose heartbeat is older than instanceTtlMs
    await this.repository.deleteExpired(this.options.instanceTtlMs, this.now);

    // 2. Probe /healthz of every remaining instance
    const instances = await this.repository.findAll();

    await Promise.all(
      instances.map(async (instance) => {
        const url = `${instance.baseUrl.replace(/\/+$/, '')}/healthz`;
        try {
          const res = await this.fetchFn(url, { method: 'GET' });
          if (res.ok) {
            instance.recordProbeSuccess();
            await this.repository.save(instance);
          } else {
            await this.handleFailure(instance.instanceId);
          }
        } catch {
          await this.handleFailure(instance.instanceId);
        }
      }),
    );
  }

  private async handleFailure(instanceId: string): Promise<void> {
    const instance = await this.repository.findById(instanceId);
    if (!instance) return;

    instance.recordProbeFailure();
    if (instance.failedProbes >= this.options.maxFailures) {
      await this.repository.delete(instanceId);
    } else {
      await this.repository.save(instance);
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runOnce().catch(() => {});
    }, this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
