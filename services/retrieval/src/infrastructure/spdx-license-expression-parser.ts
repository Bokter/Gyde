import parseSpdx from 'spdx-expression-parse';

import type { LicenseExpression, LicenseExpressionParser } from '../domain/ports';

/** Adapter of the `LicenseExpressionParser` port over `spdx-expression-parse`. */
export class SpdxLicenseExpressionParser implements LicenseExpressionParser {
  parse(expression: string): LicenseExpression {
    return parseSpdx(expression);
  }
}
