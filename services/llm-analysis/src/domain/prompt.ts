import type { AiAnalysis, AnalysisInput, Finding, ModelOutput } from './analysis';

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
 * The user message, as JSON of the data the model is allowed to see: names, versions, licenses,
 * severities and evidence. Same privacy invariant as the rest of the platform.
 */
export function buildUserPrompt(request: AnalysisInput): string {
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
 * priority) and adds `aiExplanation`; it never changes a fact. The caller validates the result
 * with the `AiResult` contract (infrastructure) before anything is published.
 */
export function applyModelPayload(request: AnalysisInput, payload: ModelOutput): AiAnalysis {
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

  return {
    analysisId: request.analysisId,
    findings: ordered,
    summary: payload.summary,
  };
}
