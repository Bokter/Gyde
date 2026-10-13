'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGitHubLogin = async () => {
    setLoading(true);
    setError(null);
    await signIn('github', { callbackUrl });
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[var(--gyde-color-fg-default)]">
            Iniciar sesión en Gyde
          </h1>
          <p className="mt-2 text-[var(--gyde-color-fg-muted)]">
            Usa tu cuenta de GitHub para acceder
          </p>
        </div>

        <div className="mt-8">
          <div className="rounded-xl border border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] p-6 shadow-sm">
            {error && (
              <div
                className="mb-4 rounded-lg border border-[var(--gyde-color-severity-critical-fg)] bg-[var(--gyde-color-severity-critical-bg)] p-3 text-sm text-[var(--gyde-color-severity-critical-fg)]"
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleGitHubLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 rounded-lg border border-[var(--gyde-color-border-control)] bg-[var(--gyde-color-bg-surface)] px-4 py-3 text-base font-medium text-[var(--gyde-color-fg-default)] hover:bg-[var(--gyde-color-bg-brand-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--gyde-color-focus-ring)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
              </svg>
              {loading ? 'Conectando...' : 'Continuar con GitHub'}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-[var(--gyde-color-fg-muted)]">
            Al continuar, autorizas a Gyde a leer tu perfil público de GitHub.
          </p>
        </div>

        <div className="text-center">
          <p className="text-sm text-[var(--gyde-color-fg-subtle)]">
            ¿No tienes cuenta?{' '}
            <button
              onClick={handleGitHubLogin}
              disabled={loading}
              className="inline-flex min-h-[44px] items-center text-[var(--gyde-color-fg-brand)] hover:underline font-medium"
            >
              Regístrate gratis
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
