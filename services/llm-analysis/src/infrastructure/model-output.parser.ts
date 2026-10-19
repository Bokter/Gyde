import { Id } from '@gyde/contracts';
import { z } from 'zod';

import type { ModelOutput } from '../domain/analysis';
import { extractJsonText } from '../domain/prompt';

/**
 * What we accept from the model. Strict on purpose: free text or an unknown field makes the call
 * fail as `llm-error` instead of leaking into the report.
 */
export const ModelPayload = z.strictObject({
  summary: z.string().max(4000).optional(),
  explanations: z
    .array(z.strictObject({ id: Id, aiExplanation: z.string().min(1).max(4000) }))
    .max(500),
});

/**
 * Parses the text block of a model answer. An answer that is not exactly one valid JSON payload
 * throws (`SyntaxError` or `ZodError`), which the use case publishes as `llm-error`.
 */
export function parseModelOutput(text: string): ModelOutput {
  return ModelPayload.parse(JSON.parse(extractJsonText(text)));
}
