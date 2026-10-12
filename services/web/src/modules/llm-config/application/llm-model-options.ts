/** Anthropic models the dashboard offers. `llm-analysis` only speaks Anthropic (ADR 0007). */
export const ANTHROPIC_MODEL_OPTIONS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'El más capaz. Recomendado.' },
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    hint: 'Equilibrio entre calidad y costo.',
  },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', hint: 'El más rápido y económico.' },
] as const;

export type AnthropicModelId = (typeof ANTHROPIC_MODEL_OPTIONS)[number]['id'];

export const DEFAULT_ANTHROPIC_MODEL: AnthropicModelId = 'claude-opus-5-5';

export function isOfferedModel(model: string): model is AnthropicModelId {
  return ANTHROPIC_MODEL_OPTIONS.some((option) => option.id === model);
}
