import type { Tenant, Subscription, StripeEvent } from './entities';

export interface TenantRepository {
  findByOwnerId(ownerId: string): Promise<Tenant | null>;
  findById(id: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  findByStripeCustomerId(customerId: string): Promise<Tenant | null>;
  create(tenant: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tenant>;
  update(id: string, data: Partial<Tenant>): Promise<Tenant>;
}

export interface SubscriptionRepository {
  findByTenantId(tenantId: string): Promise<Subscription | null>;
  findByStripeSubscriptionId(subscriptionId: string): Promise<Subscription | null>;
  create(subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<Subscription>;
  update(id: string, data: Partial<Subscription>): Promise<Subscription>;
}

export interface StripeEventRepository {
  findByStripeEventId(eventId: string): Promise<StripeEvent | null>;
  create(event: Omit<StripeEvent, 'id' | 'receivedAt'>): Promise<StripeEvent>;
  markProcessed(id: string): Promise<void>;
}

export const TENANT_REPOSITORY = Symbol('TenantRepository');
export const SUBSCRIPTION_REPOSITORY = Symbol('SubscriptionRepository');
export const STRIPE_EVENT_REPOSITORY = Symbol('StripeEventRepository');
