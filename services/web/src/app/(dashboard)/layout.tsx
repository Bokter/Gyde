'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOutAction } from './actions/auth';

const navigation = [
  { name: 'Panel', href: '/dashboard', icon: HomeIcon },
  { name: 'API Keys', href: '/dashboard/api-keys', icon: KeyIcon },
  { name: 'Facturación', href: '/dashboard/billing', icon: CreditCardIcon },
  { name: 'Llave de IA', href: '/dashboard/llm-config', icon: BrainIcon },
];

function HomeIcon({ className }: { className?: string }) {
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
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[var(--gyde-color-bg-canvas)]">
      <header className="border-b border-[var(--gyde-color-border-subtle)] bg-[var(--gyde-color-bg-surface)] sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link
                href="/dashboard"
                className="text-xl font-bold text-[var(--gyde-color-fg-brand)]"
              >
                Gyde
              </Link>
              <nav className="hidden md:flex items-center gap-1" aria-label="Navegación principal">
                {navigation.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-[var(--gyde-color-bg-brand-subtle)] text-[var(--gyde-color-fg-brand)]'
                          : 'text-[var(--gyde-color-fg-muted)] hover:text-[var(--gyde-color-fg-default)] hover:bg-[var(--gyde-color-bg-brand-subtle)]'
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}

function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="rounded-lg border border-[var(--gyde-color-border-control)] px-3 py-1.5 text-sm font-medium text-[var(--gyde-color-fg-muted)] hover:text-[var(--gyde-color-fg-default)] hover:bg-[var(--gyde-color-bg-brand-subtle)] transition-colors"
      >
        Cerrar sesión
      </button>
    </form>
  );
}
