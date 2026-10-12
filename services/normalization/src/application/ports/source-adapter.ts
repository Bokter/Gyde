import type { KnowledgeObject, SourceKind, Trust } from '@gyde/contracts';

/** One record exactly as an external source delivers it, before normalization. */
export interface RawRecord {
  /** Id inside the source, e.g. "GHSA-xxxx-xxxx-xxxx" or "CVE-2026-0001". */
  sourceId: string;
  payload: unknown;
}

/**
 * Port for ONE external source. Implementations live in `infrastructure/sources/`:
 *
 *   structured/  CVE · GHSA · OSV · NVD       (high trust, refreshed often)
 *   official/    engine documentation and changelogs (Unity, Unreal)
 *   community/   GitHub Issues, forums        (low trust, lighter processing)
 *
 * Wrap every network call in a circuit breaker (`@gyde/resilience`): a source that is down must
 * not stop the others, and the knowledge already stored keeps being served.
 */
export interface SourceAdapter {
  /** Stable name, also the `source` field of the objects it produces: "osv", "nvd", "ghsa"… */
  readonly name: string;
  readonly kind: SourceKind;
  readonly trust: Trust;

  /** Records changed since `since` (all of them when omitted). With INGEST_USE_FIXTURES, from /fixtures. */
  fetchChanges(since?: Date): AsyncIterable<RawRecord>;

  /** Maps one raw record into the common schema. Pure: no I/O, so it is trivial to test. */
  normalize(record: RawRecord): KnowledgeObject[];
}
