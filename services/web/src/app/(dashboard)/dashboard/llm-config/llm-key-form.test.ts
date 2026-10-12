import { describe, expect, it } from 'vitest';
import { initialKeyForm, keyFormReducer, saveErrorMessage } from './llm-key-form';

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
});
