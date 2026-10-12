export const USAGE_COUNTER = Symbol('UsageCounter');

/** How many analyses a tenant has started in a billing period (a calendar month, UTC). */
export interface UsageCounter {
  /**
   * Takes one analysis of the tenant's allowance. Answers false, and counts nothing, when the
   * allowance is used up. A `null` limit means unlimited.
   */
  reserve(tenantId: string, period: string, limit: number | null): boolean;
  /** Gives back an analysis taken with `reserve` that did not happen. */
  release(tenantId: string, period: string): void;
}
