import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

import { parseOrThrow } from './validate';

/**
 * Validates a request part with a contract schema from `@gyde/contracts`; invalid input becomes a
 * 400 with the failing paths. The contract is the single source of truth, so there are no DTO
 * classes and no class-validator:
 *
 *   @Post(ROUTES.reports.createAnalysis)
 *   create(@Body(new ZodValidationPipe(CreateAnalysisJob)) job: CreateAnalysisJob) { ... }
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    return parseOrThrow(this.schema, value);
  }
}
