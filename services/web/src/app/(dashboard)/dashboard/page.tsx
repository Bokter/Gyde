import { auth } from '@/modules/auth/infrastructure/auth.config';
import { redirect } from 'next/navigation';
import Link from 'next/link';

async function getTenantData(_userId: string) {
  // TODO: Implementar cuando tengamos los casos de uso
  return {
    plan: 'free' as const,
    llmConfig: null,
  };
}

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  const tenant = await getTenantData(session.user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[var(--gyde-color-fg-default)]">
          Bienvenido, {session.user.name || 'Usuario'}
        </h1>
        <p className="mt-2 text-[var(--gyde-color-fg-muted)]">
          Gestiona tu cuenta, API keys y configuración de IA desde aquí.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/dashboard/api-keys"
          className="group rounded-xl border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6 hover:border-[var(--gyde-color-action-primary-bg)] hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-[var(--gyde-color-bg-brand-subtle)] p-3 text-[var(--gyde-color-fg-brand)]">
              <KeyIcon className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium text-[var(--gyde-color-fg-muted)]">API Keys</span>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-[var(--gyde-color-fg-default)]">
            API Keys
          </h3>
          <p className="mt-2 text-sm text-[var(--gyde-color-fg-muted)]">
            Crea y gestiona tus claves de API para el CLI y GitHub Action.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--gyde-color-fg-brand)] group-hover:underline">
            Ir a API Keys
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </Link>

        <Link
          href="/dashboard/billing"
          className="group rounded-xl border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6 hover:border-[var(--gyde-color-action-primary-bg)] hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-[var(--gyde-color-bg-brand-subtle)] p-3 text-[var(--gyde-color-fg-brand)]">
              <CreditCardIcon className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium text-[var(--gyde-color-fg-muted)]">
              {tenant?.plan === 'free' ? 'Free' : tenant?.plan === 'pro' ? 'Pro' : 'Studio'}
            </span>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-[var(--gyde-color-fg-default)]">
            Facturación
          </h3>
          <p className="mt-2 text-sm text-[var(--gyde-color-fg-muted)]">
            Gestiona tu suscripción y facturas.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--gyde-color-fg-brand)] group-hover:underline">
            Ver facturación
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </Link>

        <Link
          href="/dashboard/llm-config"
          className="group rounded-xl border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6 hover:border-[var(--gyde-color-action-primary-bg)] hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-[var(--gyde-color-bg-brand-subtle)] p-3 text-[var(--gyde-color-fg-brand)]">
              <BrainIcon className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium text-[var(--gyde-color-fg-muted)]">
              {tenant?.llmConfig ? 'Configurada' : 'No configurada'}
            </span>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-[var(--gyde-color-fg-default)]">
            Llave de IA
          </h3>
          <p className="mt-2 text-sm text-[var(--gyde-color-fg-muted)]">
            Configura tu proveedor y modelo de IA (BYOK).
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--gyde-color-fg-brand)] group-hover:underline">
            Configurar IA
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </Link>

        <div className="group rounded-xl border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6">
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-[var(--gyde-color-bg-brand-subtle)] p-3 text-[var(--gyde-color-fg-brand)]">
              <TerminalIcon className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium text-[var(--gyde-color-fg-muted)]">
              CLI / Action
            </span>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-[var(--gyde-color-fg-default)]">
            Integración
          </h3>
          <p className="mt-2 text-sm text-[var(--gyde-color-fg-muted)]">
            Instala el CLI o la GitHub Action para analizar tus proyectos.
          </p>
          <div className="mt-4 space-y-2">
            <code className="block rounded bg-[var(--gyde-color-bg-canvas)] px-3 py-2 text-xs font-mono text-[var(--gyde-color-fg-default)] overflow-x-auto">
              gyde analyze --api-key $GYDE_API_KEY
            </code>
            <code className="block rounded bg-[var(--gyde-color-bg-canvas)] px-3 py-2 text-xs font-mono text-[var(--gyde-color-fg-default)] overflow-x-auto">
              uses: gyde/gyde-action@v1
            </code>
          </div>
        </div>
      </div>

      <section
        aria-labelledby="next-steps-heading"
        className="rounded-xl border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6"
      >
        <h2
          id="next-steps-heading"
          className="text-lg font-semibold text-[var(--gyde-color-fg-default)]"
        >
          Primeros pasos
        </h2>
        <ol className="mt-4 space-y-3" role="list">
          <li className="flex items-start gap-3 text-[var(--gyde-color-fg-default)]">
            <span className="flex shrink-0 items-center justify-center w-6 h-6 rounded-full bg-[var(--gyde-color-bg-brand-subtle)] text-[var(--gyde-color-fg-brand)] text-sm font-semibold">
              1
            </span>
            <span>
              Crea una{' '}
              <Link
                href="/dashboard/api-keys"
                className="text-[var(--gyde-color-fg-brand)] hover:underline"
              >
                API key
              </Link>{' '}
              para autenticar tus análisis.
            </span>
          </li>
          <li className="flex items-start gap-3 text-[var(--gyde-color-fg-default)]">
            <span className="flex shrink-0 items-center justify-center w-6 h-6 rounded-full bg-[var(--gyde-color-bg-brand-subtle)] text-[var(--gyde-color-fg-brand)] text-sm font-semibold">
              2
            </span>
            <span>
              Configura tu{' '}
              <Link
                href="/dashboard/llm-config"
                className="text-[var(--gyde-color-fg-brand)] hover:underline"
              >
                llave de IA
              </Link>{' '}
              (opcional) para explicaciones enriquecidas.
            </span>
          </li>
          <li className="flex items-start gap-3 text-[var(--gyde-color-fg-default)]">
            <span className="flex shrink-0 items-center justify-center w-6 h-6 rounded-full bg-[var(--gyde-color-bg-brand-subtle)] text-[var(--gyde-color-fg-brand)] text-sm font-semibold">
              3
            </span>
            <span>
              Ejecuta{' '}
              <code className="font-mono bg-[var(--gyde-color-bg-canvas)] px-1.5 py-0.5 rounded text-sm">
                gyde analyze
              </code>{' '}
              en tu proyecto Unity o Unreal.
            </span>
          </li>
          <li className="flex items-start gap-3 text-[var(--gyde-color-fg-default)]">
            <span className="flex shrink-0 items-center justify-center w-6 h-6 rounded-full bg-[var(--gyde-color-bg-brand-subtle)] text-[var(--gyde-color-fg-brand)] text-sm font-semibold">
              4
            </span>
            <span>
              Revisa el reporte priorizado con vulnerabilidades, licencias y compatibilidad.
            </span>
          </li>
        </ol>
      </section>
    </div>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
      />
    </svg>
  );
}

function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
      />
    </svg>
  );
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
