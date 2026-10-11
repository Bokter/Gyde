import { type AffectedRange, KnowledgeObject, type Severity } from '@gyde/contracts';
import { z } from 'zod';

import { cvssV3BaseScore, severityFromCvss } from './cvss';
import { InvalidRecordError } from './invalid-record-error';

/**
 * OSV (https://ossf.github.io/osv-schema) advisory → `KnowledgeObject`. Pure: the clock is a
 * parameter (`ingestedAt`) and nothing here touches the network or the disk.
 *
 * Only the fields Gyde uses are validated; unknown ones are ignored (OSV adds fields over time).
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
export type OsvRecord = z.infer<typeof OsvRecord>;

/** OSV ecosystems that map to a Gyde ecosystem. Everything else (npm, PyPI…) is not game tooling. */
const ECOSYSTEMS: Readonly<Record<string, AffectedRange['ecosystem']>> = { nuget: 'nuget' };

/** Range types whose versions are comparable by package version (GIT ranges are commit hashes). */
const COMPARABLE_RANGE_TYPES = new Set(['ECOSYSTEM', 'SEMVER']);

/** GitHub-style labels used by OSV's `database_specific.severity`. */
const LABELS: Readonly<Record<string, Severity>> = {
  critical: 'critical',
  high: 'high',
  moderate: 'medium',
  medium: 'medium',
  low: 'low',
};

/** Truncates to the contract limits so a long advisory is stored, not rejected. */
const clip = (text: string, max: number): string => (text.length > max ? text.slice(0, max) : text);

function rangesOf(entry: z.infer<typeof OsvAffected>, ecosystem: AffectedRange['ecosystem']) {
  const name = entry.package?.name ?? '';
  const result: AffectedRange[] = [];

  for (const range of entry.ranges) {
    if (!COMPARABLE_RANGE_TYPES.has(range.type)) continue;
    // Events come in order: "introduced" opens a range, "fixed" / "last_affected" closes it.
    let current: AffectedRange | undefined;
    const close = () => {
      if (current) result.push(current);
      current = undefined;
    };
    for (const event of range.events) {
      if (event.introduced !== undefined) {
        close();
        current = { ecosystem, name, introduced: event.introduced };
      } else if (event.fixed !== undefined) {
        result.push({ ...(current ?? { ecosystem, name }), fixed: event.fixed });
        current = undefined;
      } else if (event.last_affected !== undefined) {
        result.push({ ...(current ?? { ecosystem, name }), lastAffected: event.last_affected });
        current = undefined;
      }
    }
    close(); // introduced without fix: every later version is affected
  }

  // An explicit version list is an independent way to be affected (OR with the ranges).
  if (entry.versions.length > 0) result.push({ ecosystem, name, versions: [...entry.versions] });
  return result;
}

/**
 * @returns the normalized advisory, or `[]` when it is not relevant to Gyde (withdrawn, or no
 * package in a supported ecosystem).
 * @throws InvalidRecordError when the payload is not an OSV advisory.
 */
export function normalizeOsvRecord(payload: unknown, ingestedAt: string): KnowledgeObject[] {
  const parsed = OsvRecord.safeParse(payload);
  if (!parsed.success) {
    const sourceId =
      typeof (payload as { id?: unknown } | null)?.id === 'string'
        ? (payload as { id: string }).id
        : 'unknown';
    throw new InvalidRecordError('osv', sourceId, parsed.error.issues[0]?.message ?? 'bad shape');
  }
  const record = parsed.data;
  if (record.withdrawn) return [];

  const affected = record.affected.flatMap((entry) => {
    const ecosystem = entry.package && ECOSYSTEMS[entry.package.ecosystem.toLowerCase()];
    return ecosystem ? rangesOf(entry, ecosystem) : [];
  });
  if (affected.length === 0) return [];

  // The first v3 vector with a known score wins (OSV may also carry v2 and v4 vectors).
  const cvss = record.severity
    .filter((entry) => entry.type === 'CVSS_V3')
    .map((entry) => cvssV3BaseScore(entry.score))
    .find((score) => score !== undefined);
  const label = record.database_specific?.severity?.toLowerCase();
  const severity =
    (label && LABELS[label]) || (cvss !== undefined ? severityFromCvss(cvss) : undefined);

  const url = (
    record.references.find((reference) => reference.type === 'ADVISORY') ?? record.references[0]
  )?.url;
  const firstLine = record.details?.split('\n', 1)[0]?.trim();

  const candidate = {
    id: `osv:${record.id}`,
    kind: 'vulnerability',
    source: 'osv',
    sourceKind: 'structured',
    trust: 'high',
    title: clip(record.summary?.trim() || firstLine || record.id, 500),
    summary: clip(record.details?.trim() ?? '', 10_000),
    // The advisory's own id first: it is how another source's copy of the same advisory is found.
    aliases: [...new Set([record.id, ...record.aliases])],
    ...(severity && { severity }),
    ...(cvss !== undefined && { cvss }),
    affected,
    gameEngines: [],
    ...(url && z.url().safeParse(url).success && { url }),
    ...(record.published && { publishedAt: record.published }),
    ...(record.modified && { modifiedAt: record.modified }),
    ingestedAt,
  };
  const object = KnowledgeObject.safeParse(candidate);
  if (!object.success) {
    throw new InvalidRecordError('osv', record.id, object.error.issues[0]?.message ?? 'bad shape');
  }
  return [object.data];
}
