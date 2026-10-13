import {
  type AnalysisRequest,
  type Evidence,
  type Finding,
  type KnowledgeObject,
  SEVERITY_ORDER,
} from '@gyde/contracts';

export type AnalyzerName = 'vulnerabilities' | 'compatibility' | 'licenses';

export interface AnalyzerInput {
  request: AnalysisRequest;
  /** Candidates already fetched from the normalization service (by ecosystem and package name). */
  knowledge: readonly KnowledgeObject[];
}

export interface AnalyzerResult {
  findings: Finding[];
  evidence: Evidence[];
}

/**
 * TEMPLATE METHOD, internal to Retrieval (architecture doc: the three subtypes of analysis live
 * as modules of one service "aplicando Template Method internamente").
 *
 *   select → match → toFinding → prioritize (invariant) → collect evidence
 *
 * Pure and synchronous on purpose: same input, same output, no network and no LLM. That is what
 * lets the deterministic analysis keep working when the AI provider fails.
 */
export abstract class BaseAnalyzer<TCandidate, TMatch> {
  abstract readonly name: AnalyzerName;

  /** The template method. Do not override it. */
  analyze(input: AnalyzerInput): AnalyzerResult {
    const candidates = this.select(input);
    const matches = this.match(candidates, input);
    const findings = this.prioritize(matches.map((match) => this.toFinding(match)));
    return { findings, evidence: findings.flatMap((finding) => finding.evidence) };
  }

  /** Hook: the part of the request this analyzer cares about. */
  protected abstract select(input: AnalyzerInput): TCandidate[];

  /** Hook: deterministic matching of candidates against the knowledge. */
  protected abstract match(candidates: TCandidate[], input: AnalyzerInput): TMatch[];

  /** Hook: turns one match into an explainable finding (evidence + impact + recommendation). */
  protected abstract toFinding(match: TMatch): Finding;

  /** Invariant: most severe first, then highest CVSS, then title: a stable, deterministic order. */
  protected prioritize(findings: Finding[]): Finding[] {
    const rank = (finding: Finding) => SEVERITY_ORDER.indexOf(finding.severity);
    return [...findings].sort(
      (a, b) =>
        rank(a) - rank(b) || (b.cvss ?? 0) - (a.cvss ?? 0) || a.title.localeCompare(b.title, 'en'),
    );
  }
}
