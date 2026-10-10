import { auth } from '@/lib/auth/config';
import { redirect } from 'next/navigation';

export default async function ApiKeysPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--gyde-color-fg-default)]">API Keys</h1>
          <p className="mt-1 text-[var(--gyde-color-fg-muted)]">
            Gestiona tus claves de API para autenticar el CLI y la GitHub Action.
          </p>
        </div>
        <button className="rounded-lg bg-[var(--gyde-color-action-primary-bg)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--gyde-color-action-primary-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--gyde-color-focus-ring)] focus-visible:ring-offset-2 transition-colors">
          Nueva API Key
        </button>
      </div>

      <div className="rounded-lg border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full" role="table">
            <thead>
              <tr className="border-b border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-canvas)]">
                <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--gyde-color-fg-default)]">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--gyde-color-fg-default)]">
                  Prefijo
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--gyde-color-fg-default)]">
                  Últimos 4
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--gyde-color-fg-default)]">
                  Entorno
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--gyde-color-fg-default)]">
                  Estado
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--gyde-color-fg-default)]">
                  Creada
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--gyde-color-fg-default)]">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gyde-color-border-subtle)]">
              <tr>
                <td className="px-4 py-4 text-sm text-[var(--gyde-color-fg-muted)]" colSpan={7}>
                  No hay API keys aún. Crea tu primera clave para empezar.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6">
        <h2 className="text-lg font-semibold text-[var(--gyde-color-fg-default)] mb-4">
          Formato de las claves
        </h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--gyde-color-fg-muted)]">Prefijo live</dt>
            <dd className="font-mono text-[var(--gyde-color-fg-default)]">gyde_live_...</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--gyde-color-fg-muted)]">Prefijo test</dt>
            <dd className="font-mono text-[var(--gyde-color-fg-default)]">gyde_test_...</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--gyde-color-fg-muted)]">Longitud total</dt>
            <dd className="font-mono text-[var(--gyde-color-fg-default)]">
              44 caracteres (prefijo + 32 bytes)
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--gyde-color-fg-muted)]">Almacenamiento</dt>
            <dd className="text-[var(--gyde-color-fg-default)]">
              Solo hash (bcrypt), nunca en claro
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
