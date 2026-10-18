import type { AiResult } from '../../entities/analysis-types';
import type { ReportComponent, ReportContent } from '../report-component';
import { ReportDecorator } from '../report-decorator';
import type { Finding } from '../report-types';

/**
 * ConcreteDecorator: simplified explanations and remediation advice produced by the LLM.
 * The LLM work already happened in llm-analysis; this layer only MERGES its `AiResult` into the
 * findings.
 *
 * Priority order:
 *   1. Findings that the AI named (in AI priority order) — the LLM ranked them by significance.
 *   2. Findings the AI did not mention (in their original deterministic order).
 *
 * Gate: `entitlements.features.aiEnrichment` AND an AiResult present.
 */
export class AiEnrichmentDecorator extends ReportDecorator {
  private readonly aiResult: AiResult;

  constructor(wrapped: ReportComponent, aiResult: AiResult) {
    super(wrapped);
    this.aiResult = aiResult;
  }

  override generateContent(): ReportContent {
    const inner = super.generateContent();

    // Index deterministic findings by id for fast lookup.
    const deterministicById = new Map<string, Finding>(inner.findings.map((f) => [f.id, f]));

    // Walk AI findings in AI order, merging the aiExplanation into the matching deterministic finding.
    const aiOrdered: Finding[] = [];
    const aiIds = new Set<string>();

    for (const aiF of this.aiResult.findings) {
      const base = deterministicById.get(aiF.id);
      if (!base) continue; // AI hallucinated an id that does not exist — skip.
      aiIds.add(aiF.id);
      aiOrdered.push(aiF.aiExplanation ? { ...base, aiExplanation: aiF.aiExplanation } : base);
    }

    // Append deterministic findings the AI did not mention, preserving their original order.
    const rest = inner.findings.filter((f) => !aiIds.has(f.id));

    return {
      ...inner,
      findings: [...aiOrdered, ...rest],
      appliedLayers: [...inner.appliedLayers, 'ai-enrichment'],
    };
  }
}
