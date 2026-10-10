import { Module } from '@nestjs/common';

import { RegistryController } from './http/registry.controller';

/**
 * Composition root of the service: the only place that knows concrete implementations.
 * Bind each port to its adapter here, e.g.
 * `{ provide: REPORT_REPOSITORY, useClass: PostgresReportRepository }`, and build the use
 * cases with `useFactory` so `application/` and `domain/` stay free of NestJS.
 */
@Module({ controllers: [RegistryController] })
export class AppModule {}
