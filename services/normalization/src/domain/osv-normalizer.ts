import { cvssV3BaseScore, severityFromCvss } from './cvss';
import type { AffectedRange, Ecosystem, KnowledgeObject, Severity } from './knowledge-object';
import type { OsvAffected, OsvRecordInput } from './osv-record';

/**
 * OSV (https://ossf.github.io/osv-schema) advisory -> `KnowledgeObject`. Pure: the clock is a
 * parameter (`ingestedAt`) and nothing here touches the network or the disk. The record arrives
 * already validated (`OsvRecordInput`); whether the result fits the contract is checked by the
 * adapter in `infrastructure/`.
 */

/** OSV ecosystems that map to a Gyde ecosystem. Everything else (npm, PyPI…) is not game tooling. */
const ECOSYSTEMS: Readonly<Record<string, Ecosystem>> = { nuget: 'nuget' };

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

function rangesOf(entry: OsvAffected, ecosystem: Ecosystem): AffectedRange[] {
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
 * @param isUrl decides whether a reference is a usable URL (a bad one is dropped, not an error).
 * @returns the normalized advisory, or `[]` when it is not relevant to Gyde (withdrawn, or no
 * package in a supported ecosystem).
 */
export function normalizeOsvRecord(
  record: OsvRecordInput,
  ingestedAt: string,
  isUrl: (value: string) => boolean,
): KnowledgeObject[] {
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

  return [
    {
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
      ...(url && isUrl(url) && { url }),
      ...(record.published && { publishedAt: record.published }),
      ...(record.modified && { modifiedAt: record.modified }),
      ingestedAt,
    },
  ];
}
