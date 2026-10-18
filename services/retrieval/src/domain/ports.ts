/** A parsed SPDX license expression: a license, or two expressions joined by AND / OR. */
export type LicenseExpression =
  | { license: string; plus?: boolean | undefined; exception?: string | undefined }
  | { conjunction: 'and' | 'or'; left: LicenseExpression; right: LicenseExpression };

/** Parses SPDX license expressions. The domain only knows this contract, not the library. */
export interface LicenseExpressionParser {
  /** @throws Error when `expression` is not a valid SPDX expression. */
  parse(expression: string): LicenseExpression;
}

/**
 * Shortens a finding id that would not fit the contract's 100 characters. The domain decides WHEN
 * to shorten and how the id is made up; how the digest is computed lives in `infrastructure/`.
 */
export interface IdHasher {
  /** Lower-case hexadecimal SHA-256 of `text`. */
  sha256Hex(text: string): string;
}
