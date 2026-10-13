import type { Entitlements, Plan } from '@gyde/contracts';
import { PLAN_CATALOG } from '@gyde/contracts';
import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth/infrastructure/auth.config';
import type { BillingOverview } from '@/modules/billing/application/get-billing-overview';
import { DELIVERED_FEATURES, PLAN_MONTHLY_PRICE_USD } from '@/modules/billing/domain/plan-prices';
import { billingModule } from '@/modules/billing/infrastructure/composition-root';

const PLAN_NAMES: Record<Plan, string> = { free: 'Free', pro: 'Pro', studio: 'Studio' };

const STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  trialing: 'En periodo de prueba',
  past_due: 'Pago pendiente: Stripe está reintentando el cobro',
  unpaid: 'Impaga',
  canceled: 'Cancelada',
  incomplete: 'Pago incompleto',
  incomplete_expired: 'Pago incompleto (vencido)',
  paused: 'En pausa',
};

const NOTICES: Record<string, { tone: 'success' | 'info' | 'error'; text: string }> = {
  success: {
    tone: 'success',
    text: 'Recibimos tu pago. Tu plan se actualiza en cuanto Stripe nos lo confirme; recarga en unos segundos.',
  },
  cancelled: { tone: 'info', text: 'Cancelaste el pago. No se hizo ningún cargo.' },
  'no-customer': {
    tone: 'error',
    text: 'Todavía no tienes una suscripción que gestionar. Elige un plan para empezar.',
  },
  'invalid-plan': { tone: 'error', text: 'Ese plan no existe. Elige Pro o Studio.' },
  'stripe-unavailable': {
    tone: 'error',
    text: 'No pudimos conectar con Stripe. Inténtalo de nuevo en unos minutos.',
  },
};

const NOTICE_STYLES = {
  success: 'bg-[var(--gyde-color-status-success-bg)] text-[var(--gyde-color-status-success-fg)]',
  info: 'bg-[var(--gyde-color-severity-info-bg)] text-[var(--gyde-color-severity-info-fg)]',
  error:
    'bg-[var(--gyde-color-severity-critical-bg)] text-[var(--gyde-color-severity-critical-fg)]',
};

const CARD =
  'rounded-lg border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6';
const PRIMARY_BUTTON =
  'w-full rounded-lg bg-[var(--gyde-color-action-primary-bg)] px-4 py-2 text-sm font-medium text-[var(--gyde-color-action-primary-fg)] hover:bg-[var(--gyde-color-action-primary-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gyde-color-focus-ring)] transition-colors';
const SECONDARY_BUTTON =
  'rounded-lg border border-[var(--gyde-color-border-control)] px-4 py-2 text-sm font-medium text-[var(--gyde-color-fg-default)] hover:bg-[var(--gyde-color-bg-brand-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gyde-color-focus-ring)] transition-colors';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long' });

function features(entitlements: Entitlements): string[] {
  const { limits, features: f } = entitlements;
  return [
    limits.analysesPerMonth === null
      ? 'Análisis ilimitados'
      : `${limits.analysesPerMonth} análisis al mes`,
    limits.projects === null
      ? 'Proyectos ilimitados'
      : `${limits.projects} ${limits.projects === 1 ? 'proyecto' : 'proyectos'}`,
    ...(f.compatibilityAnalysis && DELIVERED_FEATURES.compatibilityAnalysis
      ? ['Análisis de compatibilidad']
      : []),
    ...(f.aiEnrichment ? ['Explicaciones con IA (con tu propia llave)'] : []),
  ];
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2" role="list">
      {items.map((item) => (
        <li
          key={item}
          className="flex items-center gap-2 text-sm text-[var(--gyde-color-fg-default)]"
        >
          <svg
            className="h-4 w-4 shrink-0 text-[var(--gyde-color-action-primary-bg)]"
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
          {item}
        </li>
      ))}
    </ul>
  );
}

function SubscriptionStatus({ subscription }: { subscription: BillingOverview['subscription'] }) {
  if (!subscription) {
    return <p className="mt-1 text-[var(--gyde-color-fg-muted)]">Sin suscripción de pago.</p>;
  }
  const status = STATUS_LABELS[subscription.status] ?? subscription.status;
  const end = dateFormat.format(subscription.currentPeriodEnd);
  return (
    <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
      <dt className="text-[var(--gyde-color-fg-muted)]">Suscripción</dt>
      <dd className="text-[var(--gyde-color-fg-default)]">{status}</dd>
      {subscription.status !== 'canceled' && (
        <>
          <dt className="text-[var(--gyde-color-fg-muted)]">
            {subscription.cancelAtPeriodEnd ? 'Termina el' : 'Se renueva el'}
          </dt>
          <dd className="text-[var(--gyde-color-fg-default)]">{end}</dd>
        </>
      )}
    </dl>
  );
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  const billing = billingModule();
  const tenantId = await billing.accounts.tenantIdForUser(session.user.id);
  const overview = tenantId ? await billing.overview.execute(tenantId) : null;
  if (!overview) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const notice = NOTICES[params.error ?? params.checkout ?? ''];
  const plan = overview.entitlements.plan;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--gyde-color-fg-default)]">Facturación</h1>
        <p className="mt-1 text-[var(--gyde-color-fg-muted)]">
          Gestiona tu suscripción, facturas y método de pago.
        </p>
      </div>

      <aside
        aria-labelledby="test-mode"
        className="flex gap-3 rounded-lg border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-severity-info-bg)] px-4 py-3 text-sm text-[var(--gyde-color-severity-info-fg)]"
      >
        <svg
          className="mt-0.5 h-5 w-5 shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <p id="test-mode" className="font-semibold">
            Modo de prueba
          </p>
          <p className="mt-1">
            Stripe no cobra de verdad. Paga con la tarjeta{' '}
            <span className="font-mono">4242 4242 4242 4242</span>, cualquier fecha futura y
            cualquier CVC.
          </p>
        </div>
      </aside>

      {notice && (
        <p role="status" className={`rounded-lg px-4 py-3 text-sm ${NOTICE_STYLES[notice.tone]}`}>
          {notice.text}
        </p>
      )}

      <section className={CARD} aria-labelledby="current-plan">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2
              id="current-plan"
              className="text-lg font-semibold text-[var(--gyde-color-fg-default)]"
            >
              Plan actual: {PLAN_NAMES[plan]}
            </h2>
            <SubscriptionStatus subscription={overview.subscription} />
          </div>
          {overview.canOpenPortal && (
            <form action="/api/billing/portal" method="post">
              <button type="submit" className={SECONDARY_BUTTON}>
                Gestionar suscripción
              </button>
            </form>
          )}
        </div>
        <div className="mt-4">
          <FeatureList items={features(overview.entitlements)} />
        </div>
      </section>

      {plan === 'free' && (
        <div className="grid gap-6 sm:grid-cols-2">
          {(['pro', 'studio'] as const).map((paid) => (
            <section key={paid} className={CARD} aria-labelledby={`plan-${paid}`}>
              <div className="mb-4 flex items-center justify-between">
                <h2
                  id={`plan-${paid}`}
                  className="text-lg font-semibold text-[var(--gyde-color-fg-default)]"
                >
                  {PLAN_NAMES[paid]}
                </h2>
                <span className="text-2xl font-bold text-[var(--gyde-color-fg-default)]">
                  ${PLAN_MONTHLY_PRICE_USD[paid]}
                  <span className="text-base font-normal text-[var(--gyde-color-fg-muted)]">
                    /mes
                  </span>
                </span>
              </div>
              <div className="mb-6">
                <FeatureList items={features(PLAN_CATALOG[paid])} />
              </div>
              <form action="/api/billing/checkout" method="post">
                <input type="hidden" name="plan" value={paid} />
                <button type="submit" className={PRIMARY_BUTTON}>
                  Mejorar a {PLAN_NAMES[paid]}
                </button>
              </form>
            </section>
          ))}
        </div>
      )}

      {plan !== 'free' && (
        <p className="text-sm text-[var(--gyde-color-fg-muted)]">
          Para cambiar de plan, actualizar tu método de pago, ver facturas o cancelar, usa
          «Gestionar suscripción». Serás redirigido al portal de clientes de Stripe.
        </p>
      )}
    </div>
  );
}
