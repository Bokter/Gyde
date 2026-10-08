import type { Dependency, Finding, KnowledgeObject } from '@gyde/contracts';

import { BaseAnalyzer, type AnalyzerInput } from '../base-analyzer';

export interface CompatibilityMatch {
  dependency: Dependency;
  note: KnowledgeObject;
}

/**
 * Compatibility: engine + SDK + platform. Checks the dependencies of the project against the
 * official documentation and changelogs (knowledge of kind `changelog` / `documentation`) that
 * apply to the project's game engine version, SDKs and target platforms.
 *
 * TODO(area-3): implement select/match/toFinding. It starts from a small, curated rule set in the
 * fixtures; the plan gate is `entitlements.features.compatibilityAnalysis`.
 */
export class CompatibilityAnalyzer extends BaseAnalyzer<Dependency, CompatibilityMatch> {
  readonly name = 'compatibility' as const;

  protected select(_input: AnalyzerInput): Dependency[] {
    throw new Error('TODO(area-3): CompatibilityAnalyzer.select is not implemented yet');
  }

  protected match(_candidates: Dependency[], _input: AnalyzerInput): CompatibilityMatch[] {
    throw new Error('TODO(area-3): CompatibilityAnalyzer.match is not implemented yet');
  }

  protected toFinding(_match: CompatibilityMatch): Finding {
    throw new Error('TODO(area-3): CompatibilityAnalyzer.toFinding is not implemented yet');
  }
}
