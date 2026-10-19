/** Base of every gateway application error: carries a stable `code`, never an HTTP status. */
export class GatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The key is missing, malformed, unknown, revoked or expired. One message for every reason:
 * there is nothing to enumerate.
 */
export class UnauthorizedError extends GatewayError {
  constructor() {
    super('unauthorized', 'Missing or invalid API key');
  }
}

/** The tenant has used the analyses its plan allows in the current billing period. */
export class PlanLimitExceededError extends GatewayError {
  constructor(plan: string, analysesPerMonth: number | null) {
    super(
      'plan_limit_exceeded',
      `The ${plan} plan allows ${analysesPerMonth} analyses per month and this tenant has used them`,
    );
  }
}
