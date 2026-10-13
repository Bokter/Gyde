import type { Entitlements } from '@gyde/contracts';

/** Who is calling, as resolved from the API key. Never carries the key itself. */
export interface Principal {
  tenantId: string;
  apiKeyId: string;
  /** Exactly what Web returned: the gateway never recomputes the plan. */
  entitlements: Entitlements;
}

/** Per-request data that travels to the downstream services. */
export interface RequestContext {
  requestId: string;
}
