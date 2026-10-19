/**
 * Ports the domain needs from the outside. The analyzers receive their implementation by
 * constructor; `infrastructure/` provides it (`spdx-expression-parse`, `node:crypto`).
 */

/** A single license of an SPDX expression, e.g. `GPL-2.0+` or `GPL-2.0 WITH Classpath-exception-2.0`. */
export interface LicenseNode {
  readonly license: string;
  readonly plus?: true | undefined;
  readonly exception?: string | undefined;
}

/** Two sub-expressions joined by `AND` / `OR`. */
export interface ConjunctionNode {
  readonly conjunction: 'and' | 'or';
  readonly left: LicenseNode | ConjunctionNode;
  readonly right: LicenseNode | ConjunctionNode;
}

export type LicenseExpressionNode = LicenseNode | ConjunctionNode;

export interface LicenseExpressionParser {
  /** @throws when the text is not a valid SPDX license expression. */
  parse(expression: string): LicenseExpressionNode;
}

/**
 * sha256 of a text, as lowercase hex. NOT an id generator: the same text always gives the same
 * digest, which keeps finding ids deterministic.
 */
export type DigestHex = (text: string) => string;
