/** Billing period of an instant: the calendar month in UTC, as `YYYY-MM`. */
export function billingPeriodOf(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 7);
}

/** Analyses a tenant has started in one billing period, against the allowance of its plan. */
export class TenantUsage {
  private count = 0;

  private constructor(readonly period: string) {}

  static start(period: string): TenantUsage {
    return new TenantUsage(period);
  }

  /**
   * Takes one analysis of the allowance. Answers false, and counts nothing, when it is used up.
   * A `null` limit means unlimited.
   */
  reserve(limit: number | null): boolean {
    if (limit !== null && this.count >= limit) return false;
    this.count += 1;
    return true;
  }

  /** Gives back an analysis taken with `reserve` that did not happen. */
  release(): void {
    if (this.count > 0) this.count -= 1;
  }
}
