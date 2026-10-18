/**
 * The fields of an OSV advisory (https://ossf.github.io/osv-schema) that Gyde uses, already
 * validated and with the empty-array defaults applied by the parser in `infrastructure/`.
 */
export type OsvEvent = {
  readonly introduced?: string;
  readonly fixed?: string;
  readonly last_affected?: string;
};

export type OsvAffected = {
  readonly package?: { readonly ecosystem: string; readonly name: string };
  readonly ranges: readonly { readonly type: string; readonly events: readonly OsvEvent[] }[];
  readonly versions: readonly string[];
};

export type OsvRecordInput = {
  readonly id: string;
  readonly modified?: string;
  readonly published?: string;
  readonly withdrawn?: string;
  readonly summary?: string;
  readonly details?: string;
  readonly aliases: readonly string[];
  readonly severity: readonly { readonly type: string; readonly score: string }[];
  readonly affected: readonly OsvAffected[];
  readonly references: readonly { readonly type?: string; readonly url: string }[];
  readonly database_specific?: { readonly severity?: string };
};
