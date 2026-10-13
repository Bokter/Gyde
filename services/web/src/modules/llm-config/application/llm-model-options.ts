/**
 * What the dashboard offers: the providers `llm-analysis` can call (ADR 0007) and, for each, the
 * models and the help text for its key.
 */
export interface ModelOption {
  id: string;
  label: string;
  hint: string;
}

export const LLM_PROVIDER_OPTIONS = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    keyHint: 'La encuentras en console.anthropic.com, en API keys. Empieza por sk-ant-.',
    billing: 'Tú pagas el uso directamente a Anthropic',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    keyHint: 'La encuentras en aistudio.google.com, en Get API key.',
    billing: 'Tú pagas el uso directamente a Google',
  },
] as const;

export type OfferedProvider = (typeof LLM_PROVIDER_OPTIONS)[number]['id'];

export const ANTHROPIC_MODEL_OPTIONS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'El más capaz. Recomendado.' },
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    hint: 'Equilibrio entre calidad y costo.',
  },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', hint: 'El más rápido y económico.' },
] as const satisfies readonly ModelOption[];

export const GEMINI_MODEL_OPTIONS = [
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    hint: 'El más rápido y económico. Recomendado.',
  },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', hint: 'Equilibrio entre calidad y costo.' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', hint: 'La generación más reciente.' },
] as const satisfies readonly ModelOption[];

export type AnthropicModelId = (typeof ANTHROPIC_MODEL_OPTIONS)[number]['id'];

export const DEFAULT_ANTHROPIC_MODEL: AnthropicModelId = 'claude-opus-5-5';
export const DEFAULT_PROVIDER: OfferedProvider = 'anthropic';

const MODELS: Record<OfferedProvider, readonly ModelOption[]> = {
  anthropic: ANTHROPIC_MODEL_OPTIONS,
  gemini: GEMINI_MODEL_OPTIONS,
};

export function modelsFor(provider: OfferedProvider): readonly ModelOption[] {
  return MODELS[provider];
}

export function defaultModelFor(provider: OfferedProvider): string {
  return provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : GEMINI_MODEL_OPTIONS[0].id;
}

export function providerOption(provider: OfferedProvider) {
  return LLM_PROVIDER_OPTIONS.find((option) => option.id === provider) ?? LLM_PROVIDER_OPTIONS[0];
}

export function isOfferedProvider(value: string): value is OfferedProvider {
  return LLM_PROVIDER_OPTIONS.some((option) => option.id === value);
}

export function isOfferedModel(
  model: string,
  provider: OfferedProvider = DEFAULT_PROVIDER,
): boolean {
  return modelsFor(provider).some((option) => option.id === model);
}
