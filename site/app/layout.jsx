import { Source_Sans_3, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

// The brand's own superfamily, self-hosted by next/font — no CDN, no layout
// shift. Serif carries the headlines; sans does everything else.
//
// Named `--font-*-var` rather than `--font-serif` / `--font-sans` because
// those two names belong to Tailwind's theme, where they back the font-serif
// and font-sans utilities. The theme's definitions point at these.
const serif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif-var',
  display: 'swap',
});

const sans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-var',
  display: 'swap',
});

export const metadata = {
  metadataBase: new URL('https://dossiro.com'),
  title: {
    default: 'Dossiro — the document system that keeps its own record',
    template: '%s · Dossiro',
  },
  description:
    'Dossiro is a document management system for growing organisations: control who sees what, prove who did what, and share outside without losing control. Hosted, dedicated, or fully on-premise.',
  openGraph: {
    title: 'Dossiro — the document system that keeps its own record',
    description:
      'Control who sees what, prove who did what, and share outside without losing control.',
    url: 'https://dossiro.com',
    siteName: 'Dossiro',
    type: 'website',
  },
  icons: { icon: '/brand/dossiro-logo.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
