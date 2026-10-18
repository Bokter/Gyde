import parseSpdx from 'spdx-expression-parse';

import type { LicenseExpressionNode, LicenseExpressionParser } from '../../domain/ports';

/** `LicenseExpressionParser` over `spdx-expression-parse` (it throws on an invalid expression). */
export class SpdxLicenseExpressionParser implements LicenseExpressionParser {
  parse(expression: string): LicenseExpressionNode {
    return parseSpdx(expression);
  }
}
