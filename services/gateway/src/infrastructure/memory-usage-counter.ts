import type { UsageCounter } from '../application/ports/usage-counter';

interface Usage {
  period: string;
  count: number;
}

/**
 * In-memory `UsageCounter`: one entry per tenant, holding the current period only, so memory grows
 * with the number of tenants and never with time. The counts are lost when the gateway restarts
 * and are not shared between replicas (a documented limit of the MVP).
 */
export class MemoryUsageCounter implements UsageCounter {
  private readonly usage = new Map<string, Usage>();

  reserve(tenantId: string, period: string, limit: number | null): boolean {
    const current = this.current(tenantId, period);
    if (limit !== null && current.count >= limit) return false;
    current.count += 1;
    this.usage.set(tenantId, current);
    return true;
  }

  release(tenantId: string, period: string): void {
    const entry = this.usage.get(tenantId);
    if (entry && entry.period === period && entry.count > 0) entry.count -= 1;
  }

  private current(tenantId: string, period: string): Usage {
    const entry = this.usage.get(tenantId);
    return entry && entry.period === period ? entry : { period, count: 0 };
  }
}
