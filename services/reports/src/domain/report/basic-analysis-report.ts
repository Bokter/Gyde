import type { ReportComponent, ReportContent } from './report-component';
import type { Finding } from './report-types';

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
