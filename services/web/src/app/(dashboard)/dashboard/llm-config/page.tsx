import { auth } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function LlmConfigPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-[var(--gyde-color-fg-default)]">
          Llave de IA (BYOK)
        </h1>
        <p className="mt-1 text-[var(--gyde-color-fg-muted)]">
          Configura tu proveedor y modelo de IA para obtener explicaciones enriquecidas en los
          reportes. Tu llave se cifra en reposo y nunca se muestra en la interfaz.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6">
        <h2 className="text-lg font-semibold text-[var(--gyde-color-fg-default)] mb-4">
          Configuración actual
        </h2>
        <div className="space-y-4 text-sm">
          <p className="text-[var(--gyde-color-fg-muted)]">
            No hay ninguna llave de IA configurada.
          </p>
          <button className="rounded-lg bg-[var(--gyde-color-action-primary-bg)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--gyde-color-action-primary-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--gyde-color-focus-ring)] focus-visible:ring-offset-2 transition-colors">
            Configurar llave de IA
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6">
        <h2 className="text-lg font-semibold text-[var(--gyde-color-fg-default)] mb-4">
          Cómo funciona
        </h2>
        <ul className="space-y-3 text-sm text-[var(--gyde-color-fg-muted)]" role="list">
          <li className="flex items-start gap-3">
            <svg
              className="h-5 w-5 shrink-0 text-[var(--gyde-color-action-primary-bg)] mt-0.5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>Elige tu proveedor (Anthropic u OpenAI) y el modelo que prefieras.</span>
          </li>
          <li className="flex items-start gap-3">
            <svg
              className="h-5 w-5 shrink-0 text-[var(--gyde-color-action-primary-bg)] mt-0.5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>Tu llave se cifra con AES-256-GCM antes de guardarse en la base de datos.</span>
          </li>
          <li className="flex items-start gap-3">
            <svg
              className="h-5 w-5 shrink-0 text-[var(--gyde-color-action-primary-bg)] mt-0.5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>Probamos la conexión antes de guardar para asegurar que la llave es válida.</span>
          </li>
          <li className="flex items-start gap-3">
            <svg
              className="h-5 w-5 shrink-0 text-[var(--gyde-color-action-primary-bg)] mt-0.5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>Solo se muestran los últimos 4 caracteres en la interfaz.</span>
          </li>
          <li className="flex items-start gap-3">
            <svg
              className="h-5 w-5 shrink-0 text-[var(--gyde-color-action-primary-bg)] mt-0.5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>
              La llave solo viaja por un endpoint interno autenticado hacia el servicio de análisis
              LLM.
            </span>
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-brand-subtle)] p-6">
        <h2 className="text-lg font-semibold text-[var(--gyde-color-fg-default)] mb-2">
          Requiere plan Pro o Studio
        </h2>
        <p className="text-[var(--gyde-color-fg-muted)]">
          La funcionalidad de explicaciones con IA está disponible en los planes Pro y Studio.
          Actualiza tu plan en{' '}
          <Link href="/dashboard/billing" className="text-[var(--gyde-color-fg-brand)] underline">
            Facturación
          </Link>{' '}
          para activarla.
        </p>
      </div>
    </div>
  );
}
