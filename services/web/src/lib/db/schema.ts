import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }),
    email: varchar('email', { length: 255 }),
    emailVerified: timestamp('email_verified', { withTimezone: true }),
    image: varchar('image', { length: 500 }),
    githubId: varchar('github_id', { length: 64 }).notNull().unique(),
    login: varchar('login', { length: 255 }).notNull(),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    githubIdIdx: uniqueIndex('users_github_id_idx').on(table.githubId),
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
  }),
);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: varchar('token_type', { length: 50 }),
    scope: varchar('scope', { length: 500 }),
    id_token: text('id_token'),
    session_state: varchar('session_state', { length: 255 }),
  },
  (table) => ({
    providerIdx: uniqueIndex('accounts_provider_account_id_idx').on(
      table.provider,
      table.providerAccountId,
    ),
    userIdIdx: index('accounts_user_id_idx').on(table.userId),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    sessionToken: varchar('session_token', { length: 255 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (table) => ({
    userIdIdx: index('sessions_user_id_idx').on(table.userId),
  }),
);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: varchar('identifier', { length: 255 }).notNull(),
    token: varchar('token', { length: 255 }).notNull().unique(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (table) => ({
    tokenIdx: uniqueIndex('verification_tokens_token_idx').on(table.token),
    identifierTokenIdx: uniqueIndex('verification_tokens_identifier_token_idx').on(
      table.identifier,
      table.token,
    ),
  }),
);

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plan: varchar('plan', { length: 20 }).notNull().default('free'),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    stripePriceId: varchar('stripe_price_id', { length: 255 }),
    stripeCurrentPeriodEnd: timestamp('stripe_current_period_end', { withTimezone: true }),
    stripeCancelAtPeriodEnd: boolean('stripe_cancel_at_period_end').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex('tenants_slug_idx').on(table.slug),
    ownerIdx: index('tenants_owner_id_idx').on(table.ownerId),
    stripeCustomerIdx: index('tenants_stripe_customer_id_idx').on(table.stripeCustomerId),
  }),
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }).notNull().unique(),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }).notNull(),
    stripePriceId: varchar('stripe_price_id', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('subscriptions_tenant_id_idx').on(table.tenantId),
    stripeSubIdx: uniqueIndex('subscriptions_stripe_subscription_id_idx').on(
      table.stripeSubscriptionId,
    ),
  }),
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    prefix: varchar('prefix', { length: 20 }).notNull(),
    keyHash: varchar('key_hash', { length: 128 }).notNull(),
    keyLast4: varchar('key_last4', { length: 4 }).notNull(),
    name: varchar('name', { length: 100 }),
    environment: varchar('environment', { length: 20 }).notNull().default('live'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('api_keys_tenant_id_idx').on(table.tenantId),
    keyHashIdx: uniqueIndex('api_keys_key_hash_idx').on(table.keyHash),
  }),
);

export const llmConfigs = pgTable(
  'llm_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' })
      .unique(),
    provider: varchar('provider', { length: 50 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    encryptedKey: text('encrypted_key').notNull(),
    keyLast4: varchar('key_last4', { length: 4 }).notNull(),
    kid: varchar('kid', { length: 50 }).notNull(),
    iv: varchar('iv', { length: 64 }).notNull(),
    authTag: varchar('auth_tag', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: uniqueIndex('llm_configs_tenant_id_idx').on(table.tenantId),
  }),
);

export const stripeEvents = pgTable(
  'stripe_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stripeEventId: varchar('stripe_event_id', { length: 255 }).notNull().unique(),
    type: varchar('type', { length: 100 }).notNull(),
    processed: boolean('processed').default(false).notNull(),
    payload: text('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => ({
    stripeEventIdIdx: uniqueIndex('stripe_events_stripe_event_id_idx').on(table.stripeEventId),
    processedIdx: index('stripe_events_processed_idx').on(table.processed),
  }),
);
