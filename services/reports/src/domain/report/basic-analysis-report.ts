import type { Finding } from '@gyde/contracts';

import type { ReportComponent, ReportContent } from './report-component';

/** ConcreteComponent: the raw report with the deterministic findings (vulnerabilities, licenses…). */
export class BasicAnalysisReport implements ReportComponent {
  private readonly findings: readonly Finding[];

  constructor(findings: readonly Finding[]) {
    this.findings = findings;
  }

  generateContent(): ReportContent {
    return { findings: [...this.findings], appliedLayers: ['basic'] };
  }
}
