import type { Plan } from '@gyde/contracts';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: Plan;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  stripeCurrentPeriodEnd: Date | null;
  stripeCancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: string;
  tenantId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StripeEvent {
  id: string;
  stripeEventId: string;
  type: string;
  processed: boolean;
  payload: string;
  receivedAt: Date;
  processedAt: Date | null;
}
