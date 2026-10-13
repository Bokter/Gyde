import { z } from 'zod';

import { Id, IsoDateTime } from './common';
import { ErrorCode } from './errors';
import { Finding } from './findings';

export const ReportStatus = z.enum(['pending', 'retrieving', 'analyzing', 'ready', 'failed']);
export type ReportStatus = z.infer<typeof ReportStatus>;

/**
 * Why a report is `degraded`: the AI layer was expected (plan allows it and the client asked for
 * it) but could not run. The deterministic findings are still valid.
 */
export const DegradedReason = z.enum([
  'llm-unavailable', // circuit open / provider down
  'llm-not-configured', // the tenant has no LLM key yet
  'llm-error', // the provider answered with an error
]);
export type DegradedReason = z.infer<typeof DegradedReason>;

/** Decorator layers applied on top of the basic report. */
export const ReportLayer = z.enum([
  'basic',
  'severity-score',
  'license-compliance',
  'ai-enrichment',
]);
export type ReportLayer = z.infer<typeof ReportLayer>;

export const SeverityCounts = z.strictObject({
  critical: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
  info: z.number().int().nonnegative(),
});
export type SeverityCounts = z.infer<typeof SeverityCounts>;

export const ReportSummary = z.strictObject({
  counts: SeverityCounts,
  /** 0-100, only when the severity-score layer ran. */
  riskScore: z.number().min(0).max(100).optional(),
});
export type ReportSummary = z.infer<typeof ReportSummary>;

/** Response of GET /v1/analyses/:analysisId. */
export const Report = z.strictObject({
  id: Id,
  status: ReportStatus,
  createdAt: IsoDateTime,
  completedAt: IsoDateTime.optional(),
  degraded: z.boolean(),
  degradedReason: DegradedReason.optional(),
  appliedLayers: z.array(ReportLayer),
  summary: ReportSummary,
  findings: z.array(Finding),
  error: z.strictObject({ code: ErrorCode, message: z.string() }).optional(),
});
export type Report = z.infer<typeof Report>;

/** Response of POST /v1/analyses (202 Accepted). */
export const AnalysisAccepted = z.strictObject({
  analysisId: Id,
  status: ReportStatus,
});
export type AnalysisAccepted = z.infer<typeof AnalysisAccepted>;
