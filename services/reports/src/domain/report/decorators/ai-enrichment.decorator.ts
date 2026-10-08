import type { AiResult } from '@gyde/contracts';

import type { ReportComponent, ReportContent } from '../report-component';
import { ReportDecorator } from '../report-decorator';

/**
 * ConcreteDecorator: simplified explanations and remediation advice produced by the LLM.
 * The LLM work already happened in llm-analysis; this layer only MERGES its `AiResult` into the
 * findings (matching by finding id, adding `aiExplanation` and honoring its priority order).
 *
 * TODO(area-4): implement. Gate: `entitlements.features.aiEnrichment` AND an AiResult present.
 */
export class AiEnrichmentDecorator extends ReportDecorator {
  private readonly aiResult: AiResult;

  constructor(wrapped: ReportComponent, aiResult: AiResult) {
    super(wrapped);
    this.aiResult = aiResult;
  }

  override generateContent(): ReportContent {
    void this.aiResult;
    throw new Error('TODO(area-4): AiEnrichmentDecorator.generateContent is not implemented yet');
  }
}
