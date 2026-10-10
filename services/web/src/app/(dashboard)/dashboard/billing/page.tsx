import { auth } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function BillingPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--gyde-color-fg-default)]">Facturación</h1>
        <p className="mt-1 text-[var(--gyde-color-fg-muted)]">
          Gestiona tu suscripción, facturas y método de pago.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--gyde-color-fg-default)]">
              Plan actual
            </h2>
            <p className="mt-1 text-[var(--gyde-color-fg-muted)]">
              Free — 30 análisis/mes, 1 proyecto
            </p>
          </div>
          <span className="rounded-full bg-[var(--gyde-color-bg-brand-subtle)] px-3 py-1 text-sm font-medium text-[var(--gyde-color-fg-brand)]">
            Free
          </span>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Link
          href="#"
          className="group rounded-lg border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6 hover:border-[var(--gyde-color-action-primary-bg)] hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--gyde-color-fg-default)]">Pro</h3>
            <span className="text-2xl font-bold text-[var(--gyde-color-fg-default)]">
              $29
              <span className="text-base font-normal text-[var(--gyde-color-fg-muted)]">/mes</span>
            </span>
          </div>
          <ul className="space-y-2 mb-6" role="list">
            {[
              '500 análisis al mes',
              '10 proyectos activos',
              'Análisis de compatibilidad',
              'Explicaciones con IA (BYOK)',
            ].map((feature, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-sm text-[var(--gyde-color-fg-default)]"
              >
                <svg
                  className="h-4 w-4 text-[var(--gyde-color-action-primary-bg)]"
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
                {feature}
              </li>
            ))}
          </ul>
          <button className="w-full rounded-lg border border-[var(--gyde-color-border-control)] px-4 py-2 text-sm font-medium text-[var(--gyde-color-fg-default)] hover:bg-[var(--gyde-color-bg-brand-subtle)] transition-colors">
            Actualizar a Pro
          </button>
        </Link>

        <Link
          href="#"
          className="group rounded-lg border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6 hover:border-[var(--gyde-color-action-primary-bg)] hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--gyde-color-fg-default)]">Studio</h3>
            <span className="text-2xl font-bold text-[var(--gyde-color-fg-default)]">
              $99
              <span className="text-base font-normal text-[var(--gyde-color-fg-muted)]">/mes</span>
            </span>
          </div>
          <ul className="space-y-2 mb-6" role="list">
            {[
              'Análisis ilimitados',
              'Proyectos ilimitados',
              'Soporte prioritario',
              'Todo lo de Pro',
            ].map((feature, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-sm text-[var(--gyde-color-fg-default)]"
              >
                <svg
                  className="h-4 w-4 text-[var(--gyde-color-action-primary-bg)]"
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
                {feature}
              </li>
            ))}
          </ul>
          <button className="w-full rounded-lg border border-[var(--gyde-color-border-control)] px-4 py-2 text-sm font-medium text-[var(--gyde-color-fg-default)] hover:bg-[var(--gyde-color-bg-brand-subtle)] transition-colors">
            Contactar ventas
          </button>
        </Link>
      </div>

      <div className="rounded-lg border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6">
        <h2 className="text-lg font-semibold text-[var(--gyde-color-fg-default)] mb-4">
          Facturas y pagos
        </h2>
        <p className="text-[var(--gyde-color-fg-muted)] mb-4">
          Serás redirigido al portal de clientes de Stripe para gestionar tu suscripción y ver
          facturas.
        </p>
        <button className="rounded-lg border border-[var(--gyde-color-border-control)] px-4 py-2 text-sm font-medium text-[var(--gyde-color-fg-default)] hover:bg-[var(--gyde-color-bg-brand-subtle)] transition-colors">
          Abrir portal de cliente
        </button>
      </div>
    </div>
  );
}
