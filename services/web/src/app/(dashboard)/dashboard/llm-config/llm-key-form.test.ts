import { describe, expect, it } from 'vitest';
import { initialKeyForm, keyFormReducer, saveErrorMessage, validateApiKey } from './llm-key-form';

const KEY = 'sk-ant-api03-studio-secret-0123456789abcdef';

describe('BYOK key form', () => {
  it('drops the key from the state as soon as it is submitted, whatever the outcome', () => {
    const typed = keyFormReducer(initialKeyForm(), { type: 'apiKey', value: KEY });
    expect(typed.apiKey).toBe(KEY);

    const saving = keyFormReducer(typed, { type: 'submit' });
    expect(saving.apiKey).toBe('');

    for (const outcome of [
      keyFormReducer(saving, { type: 'saved' }),
      keyFormReducer(saving, { type: 'failed', error: 'x' }),
    ]) {
      expect(JSON.stringify(outcome)).not.toContain(KEY);
    }
  });

  it('never shows text from the server, even when it quotes the key', () => {
    const echoes = { error: `upstream said ${KEY}`, reason: KEY, message: KEY };

    for (const status of [400, 403, 422, 500, 502]) {
      expect(saveErrorMessage(status, echoes)).not.toContain(KEY);
    }
    expect(saveErrorMessage(422, { reason: 'invalid-key' })).toContain('rechazó la llave');
  });

  it('switching provider resets the model to that provider default and drops what was typed', () => {
    const typed = keyFormReducer(initialKeyForm(), { type: 'apiKey', value: KEY });
    expect(typed.provider).toBe('anthropic');

    const gemini = keyFormReducer(typed, { type: 'provider', provider: 'gemini' });

    expect(gemini.provider).toBe('gemini');
    expect(gemini.model).toBe('gemini-3.5-flash-lite');
    expect(gemini.apiKey).toBe('');
    expect(JSON.stringify(gemini)).not.toContain(KEY);
    expect(initialKeyForm({ provider: 'gemini' }).model).toBe('gemini-3.5-flash-lite');
  });

  it('names the provider the studio chose, and never echoes the server', () => {
    expect(saveErrorMessage(422, { reason: 'invalid-key' }, 'Google Gemini')).toContain(
      'Google Gemini rechazó la llave',
    );
    expect(saveErrorMessage(422, { reason: 'model-not-found' }, 'Google Gemini')).toContain(
      'cuenta de Google Gemini',
    );
    expect(validateApiKey('', 'Google Gemini')).toContain('Google Gemini');
    expect(validateApiKey('1234567')).toBe('La llave debe tener entre 8 y 500 caracteres.');
  });
});
