import { z } from 'zod';

import { Ecosystem, Id, Severity, Trust } from './common';

export const FindingKind = z.enum(['vulnerability', 'license', 'compatibility', 'outdated']);
export type FindingKind = z.infer<typeof FindingKind>;

/** A piece of knowledge that supports a finding (advisory, changelog entry, license text…). */
export const Evidence = z.strictObject({
  /** Source identifier, e.g. "osv", "nvd", "ghsa", "unity-docs", "github-issues". */
  source: z.string().min(1).max(100),
  trust: Trust,
  summary: z.string().min(1).max(2000),
  url: z.url().optional(),
  /** Id of the KnowledgeObject this evidence comes from. */
  knowledgeId: Id.optional(),
});
export type Evidence = z.infer<typeof Evidence>;

export const AffectedDependency = z.strictObject({
  ecosystem: Ecosystem,
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(100),
});
export type AffectedDependency = z.infer<typeof AffectedDependency>;

/** A prioritized, explainable risk: evidence + impact + recommendation. */
export const Finding = z.strictObject({
  id: Id,
  kind: FindingKind,
  severity: Severity,
  title: z.string().min(1).max(300),
  dependency: AffectedDependency.optional(),
  evidence: z.array(Evidence).default([]),
  impact: z.string().max(2000).optional(),
  recommendation: z.string().max(2000).optional(),
  cvss: z.number().min(0).max(10).optional(),
  references: z.array(z.url()).max(20).default([]),
  /** True when produced by deterministic matching, without any LLM involved. */
  deterministic: z.boolean(),
  /** Plain-language explanation from the LLM; present only when AI enrichment ran. */
  aiExplanation: z.string().max(4000).optional(),
});
export type Finding = z.infer<typeof Finding>;
