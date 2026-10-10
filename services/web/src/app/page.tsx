import Link from 'next/link';
import { PLAN_CATALOG, type Plan } from '@gyde/contracts';

const planOrder: Plan[] = ['free', 'pro', 'studio'];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 lg:py-32" aria-labelledby="hero-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h1
              id="hero-heading"
              className="text-4xl font-bold tracking-tight text-[var(--gyde-color-fg-default)] sm:text-6xl"
            >
              Seguridad para tus dependencias de{' '}
              <span className="text-[var(--gyde-color-fg-brand)]">videojuegos</span>
            </h1>
            <p className="mt-6 text-lg text-[var(--gyde-color-fg-muted)] sm:text-xl max-w-2xl mx-auto">
              Detecta vulnerabilidades, conflictos de licencias y riesgos de compatibilidad en tus
              proyectos Unity y Unreal Engine. Tu código nunca sale de tu entorno.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                href="/auth/login"
                className="rounded-lg bg-[var(--gyde-color-action-primary-bg)] px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-[var(--gyde-color-action-primary-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--gyde-color-focus-ring)] focus-visible:ring-offset-2 transition-colors"
              >
                Empezar gratis
              </Link>
              <Link
                href="#precios"
                className="rounded-lg border border-[var(--gyde-color-border-control)] px-6 py-3 text-base font-semibold text-[var(--gyde-color-fg-default)] hover:bg-[var(--gyde-color-bg-brand-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--gyde-color-focus-ring)] focus-visible:ring-offset-2 transition-colors"
              >
                Ver planes
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section
        className="py-16 bg-[var(--gyde-color-bg-surface)]"
        aria-labelledby="features-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="features-heading" className="sr-only">
            Por qué elegir Gyde
          </h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                ),
                title: 'Tu código no sale',
                description:
                  'El análisis ocurre localmente. Solo nombres, versiones y licencias viajan al backend.',
              },
              {
                icon: (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7.19 7.19l1.41-1.41M16.95 16.95l1.41-1.41M7.19 16.81l1.41 1.41M16.95 7.05l1.41 1.41"
                    />
                  </svg>
                ),
                title: 'Análisis determinístico',
                description:
                  'Vulnerabilidades y licencias se calculan sin IA. Si la IA falla, el reporte sigue entregándose.',
              },
              {
                icon: (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                ),
                title: 'Tu llave, tu control',
                description:
                  'Trae tu propia llave de IA (BYOK). Cifrada en reposo, nunca en logs, solo tú la usas.',
              },
            ].map((feature, index) => (
              <article
                key={index}
                className="rounded-xl bg-[var(--gyde-color-bg-surface)] p-6 border border-[var(--gyde-color-border-subtle)] shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="text-[var(--gyde-color-fg-brand)] mb-4" aria-hidden="true">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-[var(--gyde-color-fg-default)] mb-2">
                  {feature.title}
                </h3>
                <p className="text-[var(--gyde-color-fg-muted)]">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="precios" className="py-20 lg:py-28" aria-labelledby="pricing-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2
              id="pricing-heading"
              className="text-3xl font-bold tracking-tight text-[var(--gyde-color-fg-default)] sm:text-4xl"
            >
              Planes para cada estudio
            </h2>
            <p className="mt-4 text-lg text-[var(--gyde-color-fg-muted)]">
              Empieza gratis y escala cuando lo necesites. Todos los planes incluyen análisis
              determinístico.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-3 max-w-6xl mx-auto">
            {planOrder.map((planKey) => {
              const plan = PLAN_CATALOG[planKey];
              const isPopular = planKey === 'pro';
              const price = planKey === 'free' ? 0 : planKey === 'pro' ? 29 : 99; // TODO: move to contracts or env
              return (
                <article
                  key={planKey}
                  className={`relative rounded-2xl border p-6 transition-shadow ${
                    isPopular
                      ? 'border-[var(--gyde-color-action-primary-bg)] shadow-lg shadow-[var(--gyde-color-action-primary-bg)]/10'
                      : 'border-[var(--gyde-color-border-subtle)] shadow-sm hover:shadow-md'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="inline-block rounded-full bg-[var(--gyde-color-action-primary-bg)] px-3 py-1 text-xs font-semibold text-white">
                        Más popular
                      </span>
                    </div>
                  )}
                  <header className="mb-6">
                    <h3 className="text-xl font-bold text-[var(--gyde-color-fg-default)]">
                      {planKey.charAt(0).toUpperCase() + planKey.slice(1)}
                    </h3>
                    <p className="mt-2 text-[var(--gyde-color-fg-muted)]">
                      {planKey === 'free'
                        ? 'Para proyectos personales y aprendizaje'
                        : planKey === 'pro'
                          ? 'Para equipos profesionales en crecimiento'
                          : 'Para estudios grandes con necesidades avanzadas'}
                    </p>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-[var(--gyde-color-fg-default)]">
                        {price === 0 ? 'Gratis' : `$${price}`}
                      </span>
                      {price > 0 && <span className="text-[var(--gyde-color-fg-muted)]">/mes</span>}
                    </div>
                  </header>
                  <ul className="space-y-3 mb-8" role="list">
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
                      <span className="text-[var(--gyde-color-fg-default)]">
                        {plan.limits.analysesPerMonth === null
                          ? 'Análisis ilimitados'
                          : `${plan.limits.analysesPerMonth} análisis al mes`}
                      </span>
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
                      <span className="text-[var(--gyde-color-fg-default)]">
                        {plan.limits.projects === null
                          ? 'Proyectos ilimitados'
                          : `${plan.limits.projects} proyecto${plan.limits.projects === 1 ? '' : 's'} activo${plan.limits.projects === 1 ? '' : 's'}`}
                      </span>
                    </li>
                    {plan.features.licenseCompliance && (
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
                        <span className="text-[var(--gyde-color-fg-default)]">
                          Análisis de vulnerabilidades
                        </span>
                      </li>
                    )}
                    {plan.features.licenseCompliance && (
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
                        <span className="text-[var(--gyde-color-fg-default)]">
                          Cumplimiento de licencias (SPDX)
                        </span>
                      </li>
                    )}
                    {plan.features.severityScoring && (
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
                        <span className="text-[var(--gyde-color-fg-default)]">
                          Puntaje de severidad
                        </span>
                      </li>
                    )}
                    {plan.features.compatibilityAnalysis && (
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
                        <span className="text-[var(--gyde-color-fg-default)]">
                          Análisis de compatibilidad (motor + SDK)
                        </span>
                      </li>
                    )}
                    {plan.features.aiEnrichment && (
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
                        <span className="text-[var(--gyde-color-fg-default)]">
                          Explicaciones con IA (BYOK)
                        </span>
                      </li>
                    )}
                  </ul>
                  <Link
                    href={planKey === 'free' ? '/auth/login' : '#'}
                    className={`block w-full rounded-lg px-6 py-3 text-center font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[var(--gyde-color-focus-ring)] focus-visible:ring-offset-2 ${
                      isPopular
                        ? 'bg-[var(--gyde-color-action-primary-bg)] text-white hover:bg-[var(--gyde-color-action-primary-bg-hover)]'
                        : 'border border-[var(--gyde-color-border-control)] text-[var(--gyde-color-fg-default)] hover:bg-[var(--gyde-color-bg-brand-subtle)]'
                    }`}
                  >
                    {planKey === 'free'
                      ? 'Empezar gratis'
                      : planKey === 'pro'
                        ? 'Suscribirse a Pro'
                        : 'Contactar ventas'}
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section
        className="py-16 bg-[var(--gyde-color-bg-brand-subtle)]"
        aria-labelledby="cta-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2
            id="cta-heading"
            className="text-2xl font-bold text-[var(--gyde-color-fg-default)] sm:text-3xl"
          >
            ¿Listo para proteger tus dependencias?
          </h2>
          <p className="mt-4 text-[var(--gyde-color-fg-muted)] max-w-2xl mx-auto">
            Conecta tu repositorio, configura tu llave de IA y obtén tu primer reporte en minutos.
          </p>
          <div className="mt-8">
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--gyde-color-action-primary-bg)] px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-[var(--gyde-color-action-primary-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--gyde-color-focus-ring)] focus-visible:ring-offset-2 transition-colors"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
              </svg>
              Iniciar con GitHub
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--gyde-color-border-subtle)] py-8" role="contentinfo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center text-[var(--gyde-color-fg-muted)] text-sm">
          <p>© {new Date().getFullYear()} Gyde. Proyecto universitario — Diseño de Software II.</p>
        </div>
      </footer>
    </main>
  );
}
