import type { Finding } from '@gyde/contracts';

import type { ReportContent } from '../report-component';
import { ReportDecorator } from '../report-decorator';

/**
 * ConcreteDecorator: license compliance and conflicts.
 *
 * Retrieval already delivers `impact` and `recommendation` in license findings. This decorator
 * only fills them defensively when they are missing (e.g. in tests or future sources that do not
 * set them). It does not invent policy-level text: if Retrieval sent empty fields, the finding
 * already captured everything knowable at this stage.
 *
 * The decorator adds `'license-compliance'` to `appliedLayers`; `renderMarkdown` uses that signal
 * to render a dedicated "Cumplimiento de licencias" section grouping license findings.
 *
 * Gate: `entitlements.features.licenseCompliance`.
 */
export class LicenseComplianceDecorator extends ReportDecorator {
  override generateContent(): ReportContent {
    const inner = super.generateContent();

    const findings = inner.findings.map((f): Finding => {
      if (f.kind !== 'license') return f;

      // Fill defensively only when Retrieval left the fields empty.
      const impact =
        f.impact ??
        'This license may impose conditions on how your project can be distributed. Review compatibility with your distribution model.';
      const recommendation =
        f.recommendation ??
        'Consult your legal team or replace the dependency with one under a compatible license.';

      if (impact === f.impact && recommendation === f.recommendation) return f;
      return { ...f, impact, recommendation };
    });

    return {
      ...inner,
      findings,
      appliedLayers: [...inner.appliedLayers, 'license-compliance'],
    };
  }
}
