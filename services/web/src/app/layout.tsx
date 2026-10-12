import type { Metadata, Viewport } from 'next';
import { bricolageGrotesque, figtree, jetbrainsMono } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Gyde — Seguridad para tus dependencias de videojuegos',
    template: '%s | Gyde',
  },
  description:
    'Detecta vulnerabilidades y conflictos de licencias en tus proyectos Unity y Unreal Engine. Tu código nunca sale de tu entorno.',
  keywords: [
    'videojuegos',
    'Unity',
    'Unreal Engine',
    'vulnerabilidades',
    'licencias',
    'seguridad',
    'dependencias',
  ],
  authors: [{ name: 'Gyde' }],
  creator: 'Gyde',
  publisher: 'Gyde',
  // Academic project with no public domain yet: keep it out of search engines.
  robots: 'noindex, nofollow',
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Gyde',
    title: 'Gyde — Seguridad para tus dependencias de videojuegos',
    description:
      'Detecta vulnerabilidades y conflictos de licencias en tus proyectos Unity y Unreal Engine.',
  },
  twitter: {
    card: 'summary',
    title: 'Gyde — Seguridad para tus dependencias de videojuegos',
    description:
      'Detecta vulnerabilidades y conflictos de licencias en tus proyectos Unity y Unreal Engine.',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1B0D' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${bricolageGrotesque.variable} ${figtree.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-[var(--gyde-color-bg-canvas)] text-[var(--gyde-color-fg-default)] antialiased">
        {children}
      </body>
    </html>
  );
}
