import type { Dependency, Finding } from '@gyde/contracts';

import { BaseAnalyzer, type AnalyzerInput } from '../base-analyzer';

export interface LicenseMatch {
  dependency: Dependency;
  /** SPDX expression of the dependency, e.g. "GPL-3.0-only" or "MIT OR Apache-2.0". */
  license: string;
  reason: 'copyleft' | 'unknown' | 'incompatible';
}

/**
 * Licenses: deterministic SPDX compatibility. Flags licenses that conflict with proprietary game
 * distribution (strong copyleft), unknown or missing licenses, and incompatible combinations.
 *
 * TODO(area-3): implement select/match/toFinding. Parse SPDX expressions (AND / OR / WITH) and
 * keep the compatibility table as data. The plan gate is `entitlements.features.licenseCompliance`.
 */
export class LicenseAnalyzer extends BaseAnalyzer<Dependency, LicenseMatch> {
  readonly name = 'licenses' as const;

  protected select(_input: AnalyzerInput): Dependency[] {
    throw new Error('TODO(area-3): LicenseAnalyzer.select is not implemented yet');
  }

  protected match(_candidates: Dependency[], _input: AnalyzerInput): LicenseMatch[] {
    throw new Error('TODO(area-3): LicenseAnalyzer.match is not implemented yet');
  }

  protected toFinding(_match: LicenseMatch): Finding {
    throw new Error('TODO(area-3): LicenseAnalyzer.toFinding is not implemented yet');
  }
}
