/** Plans Web can put in the entitlements of a key. Same literals as the contract: it is assignable. */
export type Plan = 'free' | 'pro' | 'studio';

/**
 * What a tenant may do, exactly as Web returned it: the gateway never recomputes the plan.
 * Limits use `null` for "unlimited".
 */
export interface Entitlements {
  readonly plan: Plan;
  readonly limits: {
    readonly analysesPerMonth: number | null;
    readonly projects: number | null;
  };
  readonly features: {
    readonly licenseCompliance: boolean;
    readonly compatibilityAnalysis: boolean;
    readonly severityScoring: boolean;
    readonly aiEnrichment: boolean;
  };
}

/** Who is calling, as resolved from the API key. Never carries the key itself. */
export interface Principal {
  readonly tenantId: string;
  readonly apiKeyId: string;
  readonly entitlements: Entitlements;
}
