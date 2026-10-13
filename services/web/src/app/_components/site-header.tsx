import Link from 'next/link';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gyde-color-focus-ring)]';

/** Top bar of the public pages: the product name, the sections and the way in. */
export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <a
        href="#contenido"
        className={`absolute left-2 top-2 z-50 -translate-y-[200%] rounded-md bg-[var(--gyde-color-bg-surface)] px-4 py-2 text-[var(--gyde-color-fg-brand)] focus-visible:translate-y-0 ${FOCUS}`}
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-40 border-b border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className={`rounded-md font-[family-name:var(--font-bricolage-grotesque)] text-2xl font-bold text-[var(--gyde-color-fg-brand)] no-underline ${FOCUS}`}
          >
            Gyde
          </Link>
          <nav aria-label="Secciones" className="hidden items-center gap-6 sm:flex">
            <a
              href="#caracteristicas"
              className={`rounded-md text-sm font-medium text-[var(--gyde-color-fg-default)] no-underline hover:text-[var(--gyde-color-fg-brand)] ${FOCUS}`}
            >
              Características
            </a>
            <a
              href="#precios"
              className={`rounded-md text-sm font-medium text-[var(--gyde-color-fg-default)] no-underline hover:text-[var(--gyde-color-fg-brand)] ${FOCUS}`}
            >
              Precios
            </a>
          </nav>
          <Link
            href={signedIn ? '/dashboard' : '/auth/login'}
            className={`rounded-lg bg-[var(--gyde-color-action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--gyde-color-action-primary-fg)] no-underline hover:bg-[var(--gyde-color-action-primary-bg-hover)] transition-colors ${FOCUS}`}
          >
            {signedIn ? 'Ir al panel' : 'Iniciar sesión'}
          </Link>
        </div>
      </header>
    </>
  );
}
