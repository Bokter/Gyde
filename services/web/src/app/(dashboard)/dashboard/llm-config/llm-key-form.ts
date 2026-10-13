import {
  DEFAULT_PROVIDER,
  defaultModelFor,
  type OfferedProvider,
} from '@/modules/llm-config/application/llm-model-options';

/**
 * State of the "save key" form. The key lives here only while it is being typed: `submit` takes
 * it out of the state before the request is sent, so it never survives a save, failed or not.
 */
export interface KeyFormState {
  provider: OfferedProvider;
  model: string;
  apiKey: string;
  status: 'editing' | 'saving' | 'saved' | 'failed';
  error: string | null;
}

export type KeyFormAction =
  | { type: 'provider'; provider: OfferedProvider }
  | { type: 'model'; model: string }
  | { type: 'apiKey'; value: string }
  | { type: 'submit' }
  | { type: 'saved' }
  | { type: 'failed'; error: string };

export const initialKeyForm = (
  start: { provider?: OfferedProvider; model?: string } = {},
): KeyFormState => {
  const provider = start.provider ?? DEFAULT_PROVIDER;
  return {
    provider,
    model: start.model ?? defaultModelFor(provider),
    apiKey: '',
    status: 'editing',
    error: null,
  };
};

export function keyFormReducer(state: KeyFormState, action: KeyFormAction): KeyFormState {
  switch (action.type) {
    case 'provider':
      // Another provider has other models, and its key is another key: nothing carries over.
      return {
        ...state,
        provider: action.provider,
        model: defaultModelFor(action.provider),
        apiKey: '',
        status: 'editing',
        error: null,
      };
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

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Same bounds as `LlmProviderConfigInput.apiKey`: checked before anything leaves the browser. */
export function validateApiKey(
  apiKey: string,
  providerLabel = 'tu proveedor de IA',
): string | null {
  const length = apiKey.trim().length;
  if (length === 0) return `Pega la llave de tu cuenta de ${providerLabel}.`;
  if (length < 8 || length > 500) return 'La llave debe tener entre 8 y 500 caracteres.';
  return null;
}

/**
 * Message for a failed `PUT /api/llm-config`. Built only from the status, the known reason codes
 * and the label of the provider the studio chose: nothing the server sent is echoed, so a provider
 * error that quoted the key cannot reach the screen.
 */
export function saveErrorMessage(
  status: number,
  body: unknown,
  providerLabel = 'tu proveedor de IA',
): string {
  const reason =
    body && typeof body === 'object' && 'reason' in body
      ? (body as { reason: unknown }).reason
      : null;
  if (status === 422) {
    if (reason === 'invalid-key') {
      return `${capitalize(providerLabel)} rechazó la llave. Revisa que esté completa y activa.`;
    }
    if (reason === 'model-not-found') {
      return `Tu llave no tiene acceso a ese modelo. Elige otro o revisa tu cuenta de ${providerLabel}.`;
    }
    return `No pudimos contactar a ${providerLabel} para probar la llave. Intenta de nuevo en unos minutos.`;
  }
  if (status === 400) return 'Revisa la llave: debe tener entre 8 y 500 caracteres.';
  if (status === 403) return 'Tu cuenta aún no tiene un estudio. Recarga la página.';
  return 'No pudimos guardar la llave. Intenta de nuevo en unos segundos.';
}
