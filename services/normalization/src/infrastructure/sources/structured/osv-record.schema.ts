import { z } from 'zod';

import { InvalidRecordError } from '../../../domain/invalid-record-error';
import type { OsvRecordInput } from '../../../domain/osv-record';

/**
 * Runtime validation of an OSV advisory (https://ossf.github.io/osv-schema). Only the fields Gyde
 * uses are validated; unknown ones are accepted and ignored (OSV adds fields over time), and
 * missing arrays default to empty.
 */
const OsvEvent = z.looseObject({
  introduced: z.string().optional(),
  fixed: z.string().optional(),
  last_affected: z.string().optional(),
});

const OsvAffected = z.looseObject({
  package: z.looseObject({ ecosystem: z.string(), name: z.string().min(1) }).optional(),
  ranges: z
    .array(z.looseObject({ type: z.string(), events: z.array(OsvEvent).default([]) }))
    .default([]),
  versions: z.array(z.string()).default([]),
});

export const OsvRecord = z.looseObject({
  // "osv:" is added in front and ids are limited to 100 characters.
  id: z.string().min(1).max(90),
  modified: z.string().optional(),
  published: z.string().optional(),
  withdrawn: z.string().optional(),
  summary: z.string().optional(),
  details: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  severity: z.array(z.looseObject({ type: z.string(), score: z.string() })).default([]),
  affected: z.array(OsvAffected).default([]),
  references: z.array(z.looseObject({ type: z.string().optional(), url: z.string() })).default([]),
  database_specific: z.looseObject({ severity: z.string().optional() }).optional(),
});

/**
 * @throws InvalidRecordError when the payload is not an OSV advisory (the message never carries
 * record contents, only the first validation issue).
 */
export function parseOsvRecord(payload: unknown): OsvRecordInput {
  const parsed = OsvRecord.safeParse(payload);
  if (!parsed.success) {
    const sourceId =
      typeof (payload as { id?: unknown } | null)?.id === 'string'
        ? (payload as { id: string }).id
        : 'unknown';
    throw new InvalidRecordError('osv', sourceId, parsed.error.issues[0]?.message ?? 'bad shape');
  }
  return parsed.data;
}
