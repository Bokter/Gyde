'use client';

import Link from 'next/link';
import { useCallback, useEffect, useReducer, useState, type FormEvent } from 'react';
import type { LlmProviderConfigView } from '@gyde/contracts';
import {
  ANTHROPIC_MODEL_OPTIONS,
  isOfferedModel,
} from '@/modules/llm-config/application/llm-model-options';
import { Button, Card, Dialog, Input, Select } from '@/ui';
import { messageFor, request } from '../dashboard-request';
import { initialKeyForm, keyFormReducer, saveErrorMessage, validateApiKey } from './llm-key-form';
import styles from './llm-config.module.css';

const STATUS_LABEL: Record<LlmProviderConfigView['status'], string> = {
  active: 'Activa',
  invalid: 'Inválida',
  revoked: 'Revocada',
};

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });

function modelLabel(model: string): string {
  return ANTHROPIC_MODEL_OPTIONS.find((option) => option.id === model)?.label ?? model;
}

export function LlmConfigManager() {
  // undefined: loading; null: no key stored.
  const [config, setConfig] = useState<LlmProviderConfigView | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { status, body } = await request<{ config: LlmProviderConfigView | null }>(
        '/api/llm-config',
      );
      if (status !== 200) throw new Error();
      setConfig(body.config);
      setLoadError(null);
    } catch (error) {
      setLoadError(messageFor(error, 'No pudimos cargar tu llave de IA. Intenta de nuevo.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Llave de IA</h1>
        <p className={styles.lead}>
          Con tu propia llave de Anthropic, los reportes incluyen explicaciones de cada hallazgo
          escritas por Claude. Tú pagas el uso directamente a Anthropic; Gyde no guarda la llave en
          claro ni la muestra.
        </p>
      </header>

      <p className={styles.planNote}>
        Las explicaciones con IA son parte de los planes Pro y Studio. En el plan Free puedes
        guardar la llave, pero los análisis no la usarán hasta que{' '}
        <Link href="/dashboard/billing">cambies de plan</Link>.
      </p>

      <Card aria-labelledby="llm-current-title">
        <h2 id="llm-current-title" className={styles.sectionTitle}>
          Llave actual
        </h2>
        <CurrentKey
          config={config}
          error={loadError}
          onRetry={load}
          onRevoke={() => setRevokeOpen(true)}
        />
      </Card>

      {config !== undefined && !loadError && <SaveKeyForm current={config} onSaved={setConfig} />}

      <Card aria-labelledby="llm-facts-title">
        <h2 id="llm-facts-title" className={styles.sectionTitle}>
          Cómo protegemos tu llave
        </h2>
        <dl className={styles.facts}>
          <div>
            <dt>Antes de guardarla</dt>
            <dd>La probamos contra Anthropic con el modelo elegido, sin gastar tokens.</dd>
          </div>
          <div>
            <dt>En la base de datos</dt>
            <dd>Cifrada con AES-256-GCM. Solo mostramos sus últimos 4 caracteres.</dd>
          </div>
          <div>
            <dt>Quién la usa</dt>
            <dd>
              Solo el servicio de análisis con IA, por una conexión interna autenticada y únicamente
              mientras analiza un reporte de tu estudio.
            </dd>
          </div>
          <div>
            <dt>Al revocarla</dt>
            <dd>La borramos. Los análisis siguientes salen sin explicaciones de IA.</dd>
          </div>
        </dl>
      </Card>

      <RevokeDialog
        open={revokeOpen}
        config={config ?? null}
        onClose={() => setRevokeOpen(false)}
        onRevoked={() => setConfig(null)}
      />
    </>
  );
}

function CurrentKey({
  config,
  error,
  onRetry,
  onRevoke,
}: {
  config: LlmProviderConfigView | null | undefined;
  error: string | null;
  onRetry: () => void;
  onRevoke: () => void;
}) {
  if (error) {
    return (
      <div className={styles.notice} role="alert">
        <p>{error}</p>
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (config === undefined) {
    return (
      <p className={styles.muted} role="status">
        Cargando tu llave…
      </p>
    );
  }
  if (config === null) {
    return (
      <p className={styles.muted}>
        Aún no hay una llave. Los análisis funcionan igual, pero sin explicaciones de IA.
      </p>
    );
  }

  return (
    <div className={styles.current}>
      <dl className={styles.summary}>
        <div>
          <dt>Proveedor</dt>
          <dd>Anthropic</dd>
        </div>
        <div>
          <dt>Modelo</dt>
          <dd>{modelLabel(config.model)}</dd>
        </div>
        <div>
          <dt>Llave</dt>
          <dd className={styles.mono}>••••{config.keyLast4}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>
            <span className={`${styles.status} ${styles[config.status]}`}>
              {STATUS_LABEL[config.status]}
            </span>
          </dd>
        </div>
        <div>
          <dt>{config.rotatedAt ? 'Reemplazada' : 'Guardada'}</dt>
          <dd>{dateFormat.format(new Date(config.rotatedAt ?? config.createdAt))}</dd>
        </div>
      </dl>
      <Button variant="danger" onClick={onRevoke}>
        Revocar llave
      </Button>
    </div>
  );
}

function SaveKeyForm({
  current,
  onSaved,
}: {
  current: LlmProviderConfigView | null;
  onSaved: (config: LlmProviderConfigView) => void;
}) {
  const [form, dispatch] = useReducer(
    keyFormReducer,
    current && isOfferedModel(current.model) ? current.model : undefined,
    initialKeyForm,
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [savedLast4, setSavedLast4] = useState<string | null>(null);
  const replacing = current !== null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const apiKey = form.apiKey.trim();
    const invalid = validateApiKey(apiKey);
    setFieldError(invalid);
    if (invalid) return;

    // From here on the key exists only in this function's scope, for the duration of the request.
    dispatch({ type: 'submit' });
    setSavedLast4(null);
    try {
      const { status, body } = await request<{ config?: LlmProviderConfigView }>(
        '/api/llm-config',
        {
          method: 'PUT',
          body: JSON.stringify({ provider: 'anthropic', model: form.model, apiKey }),
        },
      );
      if (status !== 200 || !body?.config) {
        dispatch({ type: 'failed', error: saveErrorMessage(status, body) });
        return;
      }
      dispatch({ type: 'saved' });
      setSavedLast4(body.config.keyLast4);
      onSaved(body.config);
    } catch (error) {
      dispatch({
        type: 'failed',
        error: messageFor(error, 'No pudimos guardar la llave. Intenta de nuevo en unos segundos.'),
      });
    }
  }

  const selected = ANTHROPIC_MODEL_OPTIONS.find((option) => option.id === form.model);

  return (
    <Card aria-labelledby="llm-form-title">
      <h2 id="llm-form-title" className={styles.sectionTitle}>
        {replacing ? 'Reemplazar la llave' : 'Conectar tu llave de Anthropic'}
      </h2>
      {savedLast4 && (
        <p className={styles.success} role="status">
          Llave probada y guardada. Termina en <span className={styles.mono}>{savedLast4}</span>.
        </p>
      )}
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.provider}>
          <span className={styles.providerLabel}>Proveedor</span>
          <span>Anthropic</span>
        </div>
        <Select
          label="Modelo"
          hint={selected?.hint}
          value={form.model}
          disabled={form.status === 'saving'}
          onChange={(event) => {
            if (isOfferedModel(event.target.value)) {
              dispatch({ type: 'model', model: event.target.value });
            }
          }}
        >
          {ANTHROPIC_MODEL_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
        <Input
          label={replacing ? 'Llave nueva' : 'Llave de API'}
          hint="La encuentras en console.anthropic.com, en API keys. Empieza por sk-ant-."
          type="password"
          value={form.apiKey}
          error={fieldError ?? undefined}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={form.status === 'saving'}
          onChange={(event) => {
            setFieldError(null);
            dispatch({ type: 'apiKey', value: event.target.value });
          }}
        />
        {form.error && (
          <p className={styles.error} role="alert">
            {form.error}
          </p>
        )}
        <div className={styles.formActions}>
          <Button type="submit" loading={form.status === 'saving'}>
            {form.status === 'saving' ? 'Probando la llave…' : 'Probar y guardar'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function RevokeDialog({
  open,
  config,
  onClose,
  onRevoked,
}: {
  open: boolean;
  config: LlmProviderConfigView | null;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function revoke() {
    setPending(true);
    setError(null);
    try {
      const { status } = await request('/api/llm-config', { method: 'DELETE' });
      // 404: already revoked (for example from another tab); the outcome is the same.
      if (status !== 200 && status !== 404) throw new Error();
      onRevoked();
      close();
    } catch (err) {
      setError(messageFor(err, 'No pudimos revocar la llave. Intenta de nuevo.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="¿Revocar la llave de IA?"
      description={
        <>
          Borraremos la llave <code>••••{config?.keyLast4}</code>. Los próximos análisis saldrán sin
          explicaciones de IA hasta que guardes otra. No se puede deshacer.
        </>
      }
      actions={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={revoke} loading={pending}>
            Revocar llave
          </Button>
        </>
      }
    >
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
