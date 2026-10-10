import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from 'next/font/google';

export const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-bricolage-grotesque',
  display: 'swap',
});

export const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-figtree',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
