/** The last subscription event applied, or the one being considered. */
export interface SubscriptionEventState {
  occurredAt: Date;
  status: string;
}

/**
 * How far along Stripe's subscription lifecycle a status is. Only used to break ties between
 * events of the same second: `customer.subscription.created` (`incomplete`) and the `updated`
 * that activates it usually share their `created` timestamp.
 */
const LIFECYCLE: Readonly<Record<string, number>> = {
  incomplete: 0,
  trialing: 1,
  active: 2,
  past_due: 3,
  paused: 3,
  unpaid: 4,
  canceled: 5,
  incomplete_expired: 5,
};

/**
 * Stripe does not guarantee delivery order. An event older than the last one applied to that
 * subscription is stale: applying it would overwrite newer state. `created` has one-second
 * resolution, so within the same second an event that would move the subscription back in its
 * lifecycle is stale too.
 */
export function isStaleEvent(
  last: SubscriptionEventState | null,
  event: SubscriptionEventState,
): boolean {
  if (last === null) return false;
  const delta = event.occurredAt.getTime() - last.occurredAt.getTime();
  if (delta !== 0) return delta < 0;
  return (LIFECYCLE[event.status] ?? 0) < (LIFECYCLE[last.status] ?? 0);
}
