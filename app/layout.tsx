import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CartProvider } from '@/components/cart';
import { CartDrawer } from '@/components/CartDrawer';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SiteChrome } from '@/components/SiteChrome';
import { Preloader, PRELOAD_SCRIPT } from '@/components/Preloader';
import { SITE_URL, MULTIBUY, PROMISES } from '@/lib/config';
import { Cormorant_Garamond, Jost, Unbounded } from 'next/font/google';

// Self-hosted with the site (no render-blocking request to Google), swapped in when ready.
const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--f-display', display: 'swap' });
const body = Jost({ subsets: ['latin'], weight: ['300', '400', '500'], variable: '--f-body', display: 'swap' });
// Only drawn onto canvases (3D store labels, garment renders), so it isn't preloaded.
const heavy = Unbounded({ subsets: ['latin'], weight: ['800'], variable: '--f-heavy', display: 'swap', preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'ENRJI® — Wear your energy', template: '%s · ENRJI®' },
  description: 'Premium tees and sweatshirts inspired by the teachings of Sneh Desai. 100% combed cotton, free shipping across India. Try them on virtually before you buy.',
  openGraph: { siteName: 'ENRJI®', type: 'website', locale: 'en_IN' },
  twitter: { card: 'summary_large_image' },
  // Staging must not compete with enrji.in in search results. Flip ALLOW_INDEXING=true at launch.
  robots: process.env.ALLOW_INDEXING === 'true' ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#f5f0e8', width: 'device-width', initialScale: 1 };

const announcements = [
  PROMISES.shipping,
  `Buy ${MULTIBUY[0].qty}, save ${MULTIBUY[0].off}%`,
  `Buy ${MULTIBUY[1].qty}, save ${MULTIBUY[1].off}%`,
  'New: try any piece on in the Trial Room',
  'Live Like Krishna — limited edition, never reprinted',
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning className={`${display.variable} ${body.variable} ${heavy.variable}`}>
      <head>
        <link rel="preconnect" href="https://cdn.shopify.com" crossOrigin="" />
        {/* Decides before the first paint whether the opening curtain plays (see components/Preloader). */}
        <script dangerouslySetInnerHTML={{ __html: PRELOAD_SCRIPT }} />
      </head>
      <body>
        <Preloader />
        <CartProvider>
          <SiteChrome>
            <div className="announce" aria-label="Offers">
              <div className="announce-track">
                {[...announcements, ...announcements].map((a, i) => <span key={i}>{a}</span>)}
              </div>
            </div>
            <Header />
          </SiteChrome>
          <main id="main">{children}</main>
          <SiteChrome><Footer /></SiteChrome>
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
