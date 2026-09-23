import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CartProvider } from '@/components/cart';
import { CartDrawer } from '@/components/CartDrawer';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SITE_URL, MULTIBUY, PROMISES } from '@/lib/config';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'ENRJI® — Wear your energy', template: '%s · ENRJI®' },
  description: 'Premium tees and sweatshirts inspired by the teachings of Sneh Desai. 100% combed cotton, free shipping across India. Try them on virtually before you buy.',
  openGraph: { siteName: 'ENRJI®', type: 'website', locale: 'en_IN' },
  twitter: { card: 'summary_large_image' },
  // Staging must not compete with enrji.in in search results. Flip ALLOW_INDEXING=true at launch.
  robots: process.env.ALLOW_INDEXING === 'true' ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#09090a', width: 'device-width', initialScale: 1 };

const announcements = [
  PROMISES.shipping,
  `Buy ${MULTIBUY[0].qty}, save ${MULTIBUY[0].off}%`,
  `Buy ${MULTIBUY[1].qty}, save ${MULTIBUY[1].off}%`,
  'New: try any piece on in the Trial Room',
  'Live Like Krishna — limited edition, never reprinted',
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="preconnect" href="https://cdn.shopify.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;800&family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" />
      </head>
      <body>
        <CartProvider>
          <div className="announce" aria-label="Offers">
            <div className="announce-track">
              {[...announcements, ...announcements].map((a, i) => <span key={i}>{a}</span>)}
            </div>
          </div>
          <Header />
          <main id="main">{children}</main>
          <Footer />
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
