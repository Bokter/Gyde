import { AiResult, type Finding, Id, type LlmAnalysisRequest } from '@gyde/contracts';
import { z } from 'zod';

/**
 * Everything that builds the model prompt and interprets its answer. The model is an untrusted
 * collaborator: it only adds plain-language explanations. Severities, evidence and every other
 * fact come from the deterministic engine and are never taken from the model.
 */

export const MODEL_SYSTEM_PROMPT = [
  'You are the analysis engine of Gyde, a platform that detects vulnerabilities, license conflicts',
  'and compatibility risks in video game projects (Unity and Unreal Engine).',
  'You receive the deterministic findings of one analysis, together with their evidence and the',
  'technical context of the project. Correlate them and explain, in plain language and for a game',
  'developer, why each finding matters and what to do about it.',
  'Answer with ONLY one JSON object, no prose and no code fences, with this exact shape:',
  '{"summary": string (optional, at most 4000 characters), "explanations": [{"id": string, "aiExplanation": string (at most 4000 characters)}]}',
  'Include one entry per finding, ordered from the most urgent to the least urgent: the order of',
  '"explanations" IS the priority of the report. Use each finding id verbatim.',
  'Never invent findings, ids, severities, versions or facts that are not in the input.',
].join(' ');

/**
 * What we accept from the model. Strict on purpose: free text or an unknown field makes the call
 * fail as `llm-error` instead of leaking into the report.
 */
export const ModelPayload = z.strictObject({
  summary: z.string().max(4000).optional(),
  explanations: z
    .array(z.strictObject({ id: Id, aiExplanation: z.string().min(1).max(4000) }))
    .max(500),
});
export type ModelPayload = z.infer<typeof ModelPayload>;

/**
 * The user message, as JSON of the data the model is allowed to see: names, versions, licenses,
 * severities and evidence. Same privacy invariant as the rest of the platform.
 */
export function buildUserPrompt(request: LlmAnalysisRequest): string {
  return JSON.stringify({
    analysisId: request.analysisId,
    project: request.project,
    findings: request.findings,
    evidence: request.evidence,
  });
}

/** Pulls the JSON object out of a text block, tolerating a model that wrapped it in fences. */
export function extractJsonText(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

/**
 * Merges the model answer into the deterministic findings: the model decides the ORDER (its
 * priority) and adds `aiExplanation`; it never changes a fact. The result is validated with the
 * `AiResult` contract before anything is published.
 */
export function applyModelPayload(request: LlmAnalysisRequest, payload: ModelPayload): AiResult {
  const byId = new Map<string, Finding>(request.findings.map((finding) => [finding.id, finding]));
  const explained = new Set<string>();
  const ordered: Finding[] = [];

  for (const { id, aiExplanation } of payload.explanations) {
    const finding = byId.get(id);
    if (!finding || explained.has(id)) {
      throw new Error(`The model explained an unknown or duplicated finding "${id}"`);
    }
    explained.add(id);
    ordered.push({ ...finding, aiExplanation });
  }

  // Findings the model did not explain keep their place, after the explained ones.
  ordered.push(...request.findings.filter((finding) => !explained.has(finding.id)));

  return AiResult.parse({
    analysisId: request.analysisId,
    findings: ordered,
    summary: payload.summary,
  });
}
