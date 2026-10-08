import { z } from 'zod';

import { Id } from './common';

export const Plan = z.enum(['free', 'pro', 'studio']);
export type Plan = z.infer<typeof Plan>;

/** What a tenant may do. Limits use `null` for "unlimited". */
export const Entitlements = z.strictObject({
  plan: Plan,
  limits: z.strictObject({
    analysesPerMonth: z.number().int().positive().nullable(),
    projects: z.number().int().positive().nullable(),
  }),
  features: z.strictObject({
    licenseCompliance: z.boolean(),
    compatibilityAnalysis: z.boolean(),
    severityScoring: z.boolean(),
    /** Still requires the tenant to have configured its own LLM key (BYOK). */
    aiEnrichment: z.boolean(),
  }),
});
export type Entitlements = z.infer<typeof Entitlements>;

/**
 * Default plan catalog (freemium model of the business doc).
 * PROPOSAL: the web area (Área 2) owns the final numbers; keep plans as data, never hardcode
 * plan names in business logic: read `Entitlements` instead.
 */
export const PLAN_CATALOG = {
  free: {
    plan: 'free',
    limits: { analysesPerMonth: 30, projects: 1 },
    features: {
      licenseCompliance: true,
      compatibilityAnalysis: false,
      severityScoring: true,
      aiEnrichment: false,
    },
  },
  pro: {
    plan: 'pro',
    limits: { analysesPerMonth: 500, projects: 10 },
    features: {
      licenseCompliance: true,
      compatibilityAnalysis: true,
      severityScoring: true,
      aiEnrichment: true,
    },
  },
  studio: {
    plan: 'studio',
    limits: { analysesPerMonth: null, projects: null },
    features: {
      licenseCompliance: true,
      compatibilityAnalysis: true,
      severityScoring: true,
      aiEnrichment: true,
    },
  },
} satisfies Record<Plan, Entitlements>;

/** Body of POST /internal/api-keys/verify (Gateway → Web). The raw key is never logged. */
export const VerifyApiKeyRequest = z.strictObject({
  apiKey: z.string().min(10).max(200),
});
export type VerifyApiKeyRequest = z.infer<typeof VerifyApiKeyRequest>;

export const VerifyApiKeyResponse = z.discriminatedUnion('valid', [
  z.strictObject({
    valid: z.literal(true),
    tenantId: Id,
    apiKeyId: Id,
    entitlements: Entitlements,
  }),
  z.strictObject({
    valid: z.literal(false),
    reason: z.enum(['unknown', 'revoked', 'expired', 'suspended']),
  }),
]);
export type VerifyApiKeyResponse = z.infer<typeof VerifyApiKeyResponse>;

/** Response of the public POST /v1/auth/verify (first step of the client pipeline). */
export const AuthVerifyResponse = z.strictObject({
  plan: Plan,
  entitlements: Entitlements,
});
export type AuthVerifyResponse = z.infer<typeof AuthVerifyResponse>;
