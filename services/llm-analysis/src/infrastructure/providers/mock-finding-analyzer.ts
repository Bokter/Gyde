import type { AiResult, InternalLlmConfig } from '@gyde/contracts';

import type { FindingAnalyzer } from '../../application/ports/finding-analyzer';
import type { AnalysisInput } from '../../domain/analysis';
import { parseAiResult } from '../mappers/ai-result.mapper';

/**
 * DETERMINISTIC stand-in for a real provider, active only when `LLM_MOCK_ENABLED=true` and the
 * studio has no key: development and demos must not need an API key, and the same input must
 * always produce the same output (same explanations, same order, same summary).
 */
export class MockFindingAnalyzer implements FindingAnalyzer {
  analyze(request: AnalysisInput, _credentials: InternalLlmConfig): Promise<AiResult> {
    const findings = request.findings.map((finding, index) => ({
      ...finding,
      aiExplanation: `Mock explanation ${index + 1} for "${finding.title}" (${finding.severity}): the deterministic engine already matched it, and this text stands in for the model's reasoning.`,
    }));

    return Promise.resolve(
      parseAiResult({
        analysisId: request.analysisId,
        findings,
        summary: `Mock analysis of ${findings.length} finding(s) for ${request.project.gameEngine} ${request.project.gameEngineVersion}.`,
      }),
    );
  }
}
