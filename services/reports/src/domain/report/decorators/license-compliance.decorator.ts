import type { ReportContent } from '../report-component';
import { ReportDecorator } from '../report-decorator';

/**
 * ConcreteDecorator: license compliance and conflicts. Adds the compliance view (which licenses
 * conflict with proprietary distribution, which are unknown) on top of the license findings that
 * Retrieval already produced.
 *
 * TODO(area-4): implement. Gate: `entitlements.features.licenseCompliance`.
 */
export class LicenseComplianceDecorator extends ReportDecorator {
  override generateContent(): ReportContent {
    throw new Error(
      'TODO(area-4): LicenseComplianceDecorator.generateContent is not implemented yet',
    );
  }
}
