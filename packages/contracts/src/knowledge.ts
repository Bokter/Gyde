import { z } from 'zod';

import { Ecosystem, GameEngine, Id, IsoDateTime, Severity, Trust } from './common';

/** Where a source sits in the trust spectrum (see architecture doc, Pipeline de Normalización). */
export const SourceKind = z.enum([
  'structured', // CVE / GHSA / OSV / NVD: high trust, frequent refresh
  'official', // engine documentation and changelogs
  'community', // GitHub Issues, forums: low trust, lighter processing
]);
export type SourceKind = z.infer<typeof SourceKind>;

export const KnowledgeKind = z.enum([
  'vulnerability',
  'changelog',
  'documentation',
  'issue',
  'license',
]);
export type KnowledgeKind = z.infer<typeof KnowledgeKind>;

/** Version range affected by a vulnerability, modeled after the OSV schema. */
export const AffectedRange = z.strictObject({
  ecosystem: Ecosystem,
  name: z.string().min(1).max(200),
  /** First affected version (inclusive). */
  introduced: z.string().optional(),
  /** First fixed version (exclusive upper bound). */
  fixed: z.string().optional(),
  /** Last affected version (inclusive) when there is no fix. */
  lastAffected: z.string().optional(),
  /** Explicit list of affected versions, when the source gives one. */
  versions: z.array(z.string()).optional(),
});
export type AffectedRange = z.infer<typeof AffectedRange>;

/** Common schema every source is normalized into. */
export const KnowledgeObject = z.strictObject({
  /** Stable id: "<source>:<id in the source>", e.g. "osv:GHSA-xxxx". */
  id: Id,
  kind: KnowledgeKind,
  /** osv | nvd | ghsa | unity-docs | unreal-docs | github-issues | spdx … */
  source: z.string().min(1).max(50),
  sourceKind: SourceKind,
  trust: Trust,
  title: z.string().min(1).max(500),
  summary: z.string().max(10_000).default(''),
  /** Cross references: CVE-…, GHSA-… */
  aliases: z.array(z.string()).default([]),
  severity: Severity.optional(),
  cvss: z.number().min(0).max(10).optional(),
  affected: z.array(AffectedRange).default([]),
  /** Game engines the item applies to (compatibility and documentation items). */
  gameEngines: z.array(GameEngine).default([]),
  url: z.url().optional(),
  publishedAt: IsoDateTime.optional(),
  modifiedAt: IsoDateTime.optional(),
  ingestedAt: IsoDateTime,
});
export type KnowledgeObject = z.infer<typeof KnowledgeObject>;

/** Body of POST /internal/knowledge/query (Retrieval → Normalization). */
export const KnowledgeQuery = z.strictObject({
  packages: z
    .array(
      z.strictObject({
        ecosystem: Ecosystem,
        name: z.string().min(1).max(200),
        version: z.string().min(1).max(100),
      }),
    )
    .min(1)
    .max(5000),
  kinds: z.array(KnowledgeKind).optional(),
  gameEngine: GameEngine.optional(),
  limit: z.number().int().min(1).max(5000).default(1000),
});
export type KnowledgeQuery = z.infer<typeof KnowledgeQuery>;

export const KnowledgeQueryResult = z.strictObject({
  objects: z.array(KnowledgeObject),
});
export type KnowledgeQueryResult = z.infer<typeof KnowledgeQueryResult>;

/** One source as reported by GET /internal/sources (Normalization, for operators and dashboards). */
export const SourceStatus = z.strictObject({
  /** Same as `KnowledgeObject.source`: "osv", "nvd", "ghsa"… */
  name: z.string().min(1).max(50),
  kind: SourceKind,
  trust: Trust,
  /**
   * `never`: not ingested yet. `ok`: the last attempt succeeded. `failed`: the last attempt
   * failed; the knowledge stored by earlier ingestions keeps being served.
   */
  status: z.enum(['never', 'ok', 'failed']),
  /** Finish time of the last SUCCESSFUL ingestion. */
  lastIngestedAt: IsoDateTime.optional(),
  lastAttemptAt: IsoDateTime.optional(),
  /** Short reason of the last failed attempt. Never carries secrets. */
  lastError: z.string().max(500).optional(),
});
export type SourceStatus = z.infer<typeof SourceStatus>;

export const SourcesStatus = z.strictObject({ sources: z.array(SourceStatus) });
export type SourcesStatus = z.infer<typeof SourcesStatus>;

/** Answer of POST /internal/ingest/:source once the ingestion finished successfully. */
export const IngestResult = z.strictObject({
  source: z.string().min(1).max(50),
  /** Objects stored (inserted or updated). */
  recordsProcessed: z.number().int().min(0),
  /** Records the source delivered that were not stored (malformed, or not relevant to Gyde). */
  recordsSkipped: z.number().int().min(0),
  startedAt: IsoDateTime,
  finishedAt: IsoDateTime,
});
export type IngestResult = z.infer<typeof IngestResult>;
