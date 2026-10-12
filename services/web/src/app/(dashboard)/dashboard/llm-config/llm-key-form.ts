import {
  DEFAULT_ANTHROPIC_MODEL,
  type AnthropicModelId,
} from '@/modules/llm-config/application/llm-model-options';

/**
 * State of the "save key" form. The key lives here only while it is being typed: `submit` takes
 * it out of the state before the request is sent, so it never survives a save, failed or not.
 */
export interface KeyFormState {
  model: AnthropicModelId;
  apiKey: string;
  status: 'editing' | 'saving' | 'saved' | 'failed';
  error: string | null;
}

export type KeyFormAction =
  | { type: 'model'; model: AnthropicModelId }
  | { type: 'apiKey'; value: string }
  | { type: 'submit' }
  | { type: 'saved' }
  | { type: 'failed'; error: string };

export const initialKeyForm = (
  model: AnthropicModelId = DEFAULT_ANTHROPIC_MODEL,
): KeyFormState => ({
  model,
  apiKey: '',
  status: 'editing',
  error: null,
});

export function keyFormReducer(state: KeyFormState, action: KeyFormAction): KeyFormState {
  switch (action.type) {
    case 'model':
      return { ...state, model: action.model };
    case 'apiKey':
      return { ...state, apiKey: action.value, status: 'editing', error: null };
    case 'submit':
      return { ...state, apiKey: '', status: 'saving', error: null };
    case 'saved':
      return { ...state, apiKey: '', status: 'saved', error: null };
    case 'failed':
      return { ...state, apiKey: '', status: 'failed', error: action.error };
  }
}

/** Same bounds as `LlmProviderConfigInput.apiKey`: checked before anything leaves the browser. */
export function validateApiKey(apiKey: string): string | null {
  const length = apiKey.trim().length;
  if (length === 0) return 'Pega la llave de tu cuenta de Anthropic.';
  if (length < 8 || length > 500) return 'La llave debe tener entre 8 y 500 caracteres.';
  return null;
}

/**
 * Message for a failed `PUT /api/llm-config`. Built only from the status and the known reason
 * codes: nothing the server sent is echoed, so a provider error that quoted the key cannot reach
 * the screen.
 */
export function saveErrorMessage(status: number, body: unknown): string {
  const reason =
    body && typeof body === 'object' && 'reason' in body
      ? (body as { reason: unknown }).reason
      : null;
  if (status === 422) {
    if (reason === 'invalid-key') {
      return 'Anthropic rechazó la llave. Revisa que esté completa y activa.';
    }
    if (reason === 'model-not-found') {
      return 'Tu llave no tiene acceso a ese modelo. Elige otro o revisa tu cuenta de Anthropic.';
    }
    return 'No pudimos contactar a Anthropic para probar la llave. Intenta de nuevo en unos minutos.';
  }
  if (status === 400) return 'Revisa la llave: debe tener entre 8 y 500 caracteres.';
  if (status === 403) return 'Tu cuenta aún no tiene un estudio. Recarga la página.';
  return 'No pudimos guardar la llave. Intenta de nuevo en unos segundos.';
}
