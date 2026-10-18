import type { AiAnalysis } from '../../domain/analysis';
import type { AnalyzeFindingsDto } from '../dto/llm-analysis.dto';

/** What happened when a model call went through the policy. */
export type ModelCallOutcome =
  /** The call succeeded; its result is already remembered for the fallback. */
  | { status: 'ok'; value: AiAnalysis }
  /** The circuit is open and the call was NOT made; `cached` is the last answer for these findings. */
  | { status: 'circuit-open'; cached?: AiAnalysis | undefined }
  /** The call failed; `circuitOpen` tells if that failure just opened the circuit. */
  | { status: 'failed'; error: unknown; circuitOpen: boolean };

/**
 * Port to the resilience policy of the model calls: a circuit breaker per TENANT + PROVIDER (the
 * `scope` key, `${tenantId}:${provider}`) and a fallback cache with the last answer per scope and
 * findings. One studio's invalid key or rate limit never opens the circuit of another.
 *
 * The implementation must live as long as the service: a breaker that is recreated per call never
 * opens. Implementations live in `infrastructure/`.
 */
export interface ModelCallPolicy {
  /**
   * Runs `call` behind the breaker of `scope`. With the circuit open it does not call; otherwise
   * a successful answer is cached by (scope, findings + evidence of `request`). Never throws.
   */
  run(
    scope: string,
    request: AnalyzeFindingsDto,
    call: () => Promise<AiAnalysis>,
  ): Promise<ModelCallOutcome>;

  /** Whether the circuit of `scope` is open right now. */
  isOpen(scope: string): boolean;
}

/** DI token of the `ModelCallPolicy` port: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const MODEL_CALL_POLICY = Symbol('ModelCallPolicy');
