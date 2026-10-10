import type { Metadata, Viewport } from 'next';
import { bricolageGrotesque, figtree, jetbrainsMono } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Gyde — Seguridad para tus dependencias de videojuegos',
    template: '%s | Gyde',
  },
  description:
    'Detecta vulnerabilidades, conflictos de licencias y riesgos de compatibilidad en tus proyectos Unity y Unreal Engine. Tu código nunca sale de tu entorno.',
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
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: 'https://gyde.example',
    siteName: 'Gyde',
    title: 'Gyde — Seguridad para tus dependencias de videojuegos',
    description:
      'Detecta vulnerabilidades, conflictos de licencias y riesgos de compatibilidad en tus proyectos Unity y Unreal Engine.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Gyde - Seguridad para dependencias de videojuegos',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gyde — Seguridad para tus dependencias de videojuegos',
    description:
      'Detecta vulnerabilidades, conflictos de licencias y riesgos de compatibilidad en tus proyectos Unity y Unreal Engine.',
    images: ['/og-image.png'],
  },
  verification: {
    google: 'google-site-verification-code',
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
