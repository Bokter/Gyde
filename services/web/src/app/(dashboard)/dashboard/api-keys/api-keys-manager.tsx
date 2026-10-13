'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ApiKeyStatus, ApiKeyView } from '@/modules/api-keys/application/api-key-view';
import { Button, Card, CopyField, Dialog, Input, Table, Td, Th } from '@/ui';
import { messageFor, request } from '../dashboard-request';
import styles from './api-keys.module.css';

type Environment = ApiKeyView['environment'];

const STATUS_LABEL: Record<ApiKeyStatus, string> = {
  active: 'Activa',
  revoked: 'Revocada',
  expired: 'Expirada',
};

const ENVIRONMENT_LABEL: Record<Environment, string> = {
  test: 'Pruebas',
  live: 'Producción',
};

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium' });

function formatDate(iso: string | null): string {
  return iso ? dateFormat.format(new Date(iso)) : 'Nunca';
}

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKeyView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [toRevoke, setToRevoke] = useState<ApiKeyView | null>(null);

  const load = useCallback(async () => {
    try {
      const { status, body } = await request<{ apiKeys: ApiKeyView[] }>('/api/api-keys');
      if (status !== 200) throw new Error();
      setKeys([...body.apiKeys].reverse());
      setLoadError(null);
    } catch (error) {
      setLoadError(messageFor(error, 'No pudimos cargar tus API keys. Intenta de nuevo.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>API keys</h1>
          <p className={styles.lead}>
            Con una API key, el CLI y la GitHub Action se identifican ante Gyde. Crea una por cada
            lugar donde la uses, así puedes revocarla sin afectar a las demás.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Nueva API key</Button>
      </header>

      <Card aria-labelledby="api-keys-list-title">
        <h2 id="api-keys-list-title" className={styles.sectionTitle}>
          Tus claves
        </h2>
        <KeysList
          keys={keys}
          error={loadError}
          onRetry={load}
          onRevoke={setToRevoke}
          onCreate={() => setCreateOpen(true)}
        />
      </Card>

      <Card aria-labelledby="api-keys-format-title">
        <h2 id="api-keys-format-title" className={styles.sectionTitle}>
          Cómo son las claves
        </h2>
        <dl className={styles.facts}>
          <div>
            <dt>Prefijo</dt>
            <dd>
              <code>gyde_test_</code> para pruebas y <code>gyde_live_</code> para producción.
            </dd>
          </div>
          <div>
            <dt>Longitud</dt>
            <dd>74 caracteres: el prefijo y 64 caracteres hexadecimales (32 bytes aleatorios).</dd>
          </div>
          <div>
            <dt>Cómo la guardamos</dt>
            <dd>
              Solo su huella SHA-256. Nadie, ni siquiera Gyde, puede volver a mostrarte la clave: si
              la pierdes, crea otra y revoca la anterior.
            </dd>
          </div>
        </dl>
      </Card>

      <CreateKeyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void load()}
      />
      <RevokeKeyDialog
        apiKey={toRevoke}
        onClose={() => setToRevoke(null)}
        onRevoked={() => void load()}
      />
    </>
  );
}

function KeysList({
  keys,
  error,
  onRetry,
  onRevoke,
  onCreate,
}: {
  keys: ApiKeyView[] | null;
  error: string | null;
  onRetry: () => void;
  onRevoke: (key: ApiKeyView) => void;
  onCreate: () => void;
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
  if (!keys) {
    return (
      <p className={styles.muted} role="status">
        Cargando tus claves…
      </p>
    );
  }
  if (keys.length === 0) {
    return (
      <div className={styles.empty}>
        <p>Aún no tienes API keys. Crea la primera para conectar el CLI o la GitHub Action.</p>
        <Button onClick={onCreate}>Crear mi primera API key</Button>
      </div>
    );
  }

  return (
    <Table caption="API keys del estudio">
      <thead>
        <tr>
          <Th>Nombre</Th>
          <Th>Clave</Th>
          <Th>Entorno</Th>
          <Th>Estado</Th>
          <Th>Creada</Th>
          <Th>Último uso</Th>
          <Th>
            <span className={styles.visuallyHidden}>Acciones</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => (
          <tr key={key.id}>
            <Td label="Nombre">{key.name ?? <span className={styles.muted}>Sin nombre</span>}</Td>
            <Td label="Clave" mono>
              {key.prefix}…{key.keyLast4}
            </Td>
            <Td label="Entorno">{ENVIRONMENT_LABEL[key.environment]}</Td>
            <Td label="Estado">
              <span className={`${styles.status} ${styles[key.status]}`}>
                {STATUS_LABEL[key.status]}
              </span>
            </Td>
            <Td label="Creada">{formatDate(key.createdAt)}</Td>
            <Td label="Último uso">{formatDate(key.lastUsedAt)}</Td>
            <Td label="Acciones">
              {key.status === 'active' && (
                <Button
                  variant="ghost"
                  onClick={() => onRevoke(key)}
                  aria-label={`Revocar la clave ${key.name ?? `${key.prefix}…${key.keyLast4}`}`}
                >
                  Revocar
                </Button>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function CreateKeyDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<Environment>('test');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The plain key lives only here, only until the dialog closes; it is never stored or refetched.
  const [plainKey, setPlainKey] = useState<string | null>(null);

  function close() {
    setPlainKey(null);
    setName('');
    setEnvironment('test');
    setError(null);
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { status, body } = await request<{ plainKey?: string }>('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() || null, environment }),
      });
      if (status !== 201 || !body?.plainKey) throw new Error();
      setPlainKey(body.plainKey);
      onCreated();
    } catch (err) {
      setError(messageFor(err, 'No pudimos crear la clave. Intenta de nuevo en unos segundos.'));
    } finally {
      setPending(false);
    }
  }

  if (plainKey) {
    return (
      <Dialog
        open={open}
        onClose={close}
        title="Tu nueva API key"
        description="Cópiala ahora y guárdala en un lugar seguro, como los secretos de tu repositorio. Por seguridad, no volveremos a mostrarla."
        actions={<Button onClick={close}>Ya la guardé</Button>}
      >
        <CopyField label="API key" value={plainKey} />
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Nueva API key"
      description="La clave se muestra una sola vez, justo después de crearla."
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <Input
          label="Nombre (opcional)"
          hint="Te ayuda a reconocerla después, por ejemplo «GitHub Action de mi-juego»."
          value={name}
          maxLength={100}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Entorno</legend>
          {(['test', 'live'] as const).map((value) => (
            <label key={value} className={styles.radio}>
              <input
                type="radio"
                name="environment"
                value={value}
                checked={environment === value}
                onChange={() => setEnvironment(value)}
              />
              <span>
                {ENVIRONMENT_LABEL[value]} <code>gyde_{value}_</code>
              </span>
            </label>
          ))}
        </fieldset>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Crear clave
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RevokeKeyDialog({
  apiKey,
  onClose,
  onRevoked,
}: {
  apiKey: ApiKeyView | null;
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
    if (!apiKey) return;
    setPending(true);
    setError(null);
    try {
      const { status } = await request(`/api/api-keys/${encodeURIComponent(apiKey.id)}/revoke`, {
        method: 'POST',
      });
      // 400 means it was already revoked (for example from another tab): the outcome is the same.
      if (status !== 200 && status !== 400) {
        throw new Error(status === 404 ? 'not-found' : 'failed');
      }
      onRevoked();
      close();
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'not-found'
          ? 'Esta clave ya no existe. Recarga la lista.'
          : messageFor(err, 'No pudimos revocar la clave. Intenta de nuevo.'),
      );
    } finally {
      setPending(false);
    }
  }

  const keyLabel = apiKey ? `${apiKey.prefix}…${apiKey.keyLast4}` : '';

  return (
    <Dialog
      open={apiKey !== null}
      onClose={close}
      title="¿Revocar esta API key?"
      description={
        <>
          Todo lo que use <code>{keyLabel}</code>
          {apiKey?.name ? ` («${apiKey.name}»)` : ''} dejará de funcionar de inmediato. No se puede
          deshacer.
        </>
      }
      actions={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={revoke} loading={pending}>
            Revocar clave
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
