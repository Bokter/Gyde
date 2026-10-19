import { Logger, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { APP_CONFIG } from '@gyde/service-kit';

import {
  DEREGISTER_INSTANCE,
  DeregisterInstanceUseCase,
} from './application/use-cases/deregister-instance.use-case';
import {
  HEARTBEAT_INSTANCE,
  HeartbeatInstanceUseCase,
} from './application/use-cases/heartbeat-instance.use-case';
import {
  REGISTRY_REPOSITORY,
  type RegistryRepository,
} from './domain/repositories/registry.repository';
import {
  REGISTER_INSTANCE,
  RegisterInstanceUseCase,
} from './application/use-cases/register-instance.use-case';
import {
  RESOLVE_SERVICE_INSTANCES,
  ResolveServiceInstancesUseCase,
} from './application/use-cases/resolve-service-instances.use-case';
import type { Config } from './config';
import { ApplicationErrorInterceptor } from './http/application-error.interceptor';
import { RegistryController } from './http/registry.controller';
import { HEALTH_CHECKER, HealthChecker } from './infrastructure/health-checker';
import { InMemoryRegistryRepository } from './infrastructure/repositories/in-memory-registry.repository';

export interface AppModuleOverrides {
  repository?: RegistryRepository;
  healthChecker?: HealthChecker;
  now?: () => number;
  fetch?: typeof fetch;
}

/**
 * Composition root of the registry service (ADR 0011).
 * Binds port tokens to adapters and builds use cases via `useFactory`
 * so application/ and domain/ stay free of NestJS dependencies.
 */
@Module({ controllers: [RegistryController] })
export class AppModule {
  static withOverrides(overrides: AppModuleOverrides = {}) {
    return {
      module: AppModule,
      providers: [
        { provide: APP_INTERCEPTOR, useClass: ApplicationErrorInterceptor },
        {
          provide: REGISTRY_REPOSITORY,
          useValue: overrides.repository ?? new InMemoryRegistryRepository(),
        },
        {
          provide: REGISTER_INSTANCE,
          useFactory: (repo: RegistryRepository) =>
            new RegisterInstanceUseCase(repo, { now: overrides.now }),
          inject: [REGISTRY_REPOSITORY],
        },
        {
          provide: HEARTBEAT_INSTANCE,
          useFactory: (repo: RegistryRepository) =>
            new HeartbeatInstanceUseCase(repo, { now: overrides.now }),
          inject: [REGISTRY_REPOSITORY],
        },
        {
          provide: DEREGISTER_INSTANCE,
          useFactory: (repo: RegistryRepository) => new DeregisterInstanceUseCase(repo),
          inject: [REGISTRY_REPOSITORY],
        },
        {
          provide: RESOLVE_SERVICE_INSTANCES,
          useFactory: (repo: RegistryRepository, config: Config) =>
            new ResolveServiceInstancesUseCase(repo, {
              instanceTtlMs: config.INSTANCE_TTL_MS,
              now: overrides.now,
            }),
          inject: [REGISTRY_REPOSITORY, APP_CONFIG],
        },
        {
          provide: HEALTH_CHECKER,
          useFactory: (repo: RegistryRepository, config: Config) =>
            overrides.healthChecker ??
            new HealthChecker(repo, {
              intervalMs: config.HEALTH_CHECK_INTERVAL_MS,
              maxFailures: config.HEALTH_CHECK_MAX_FAILURES,
              instanceTtlMs: config.INSTANCE_TTL_MS,
              fetch: overrides.fetch,
              now: overrides.now,
              logger: new Logger('HealthChecker'),
            }),
          inject: [REGISTRY_REPOSITORY, APP_CONFIG],
        },
      ],
      exports: [
        REGISTRY_REPOSITORY,
        REGISTER_INSTANCE,
        HEARTBEAT_INSTANCE,
        DEREGISTER_INSTANCE,
        RESOLVE_SERVICE_INSTANCES,
        HEALTH_CHECKER,
      ],
    };
  }
}
