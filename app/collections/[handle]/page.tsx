import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProducts, pillarOf, type Product } from '@/lib/catalogue';
import { ShopGrid } from '@/components/ShopGrid';
import { ratingsByHandle } from '@/lib/reviews';

export const revalidate = 300;

const COLLECTIONS: Record<string, { title: string; eyebrow: string; lead: string; kind?: 'tee' | 'sweatshirt'; filter?: (p: Product) => boolean }> = {
  tees: { title: 'Tees', eyebrow: '220 GSM · Half sleeve', lead: 'Bio-washed combed cotton that is soft from the first wear. Unisex regular fit, S to 3XL.', kind: 'tee' },
  sweatshirts: { title: 'Sweatshirts', eyebrow: '250 GSM · Warmth without bulk', lead: 'Heavier combed cotton, bio-washed, with the same ideas you wear every day.', kind: 'sweatshirt' },
  'limited-edition': { title: 'Limited edition', eyebrow: 'Live Like Krishna', lead: 'Worn on stage by Sneh sir. Made once, in a small edition. Never reprinted.', filter: (p) => p.limited },
};

export function generateStaticParams() {
  return Object.keys(COLLECTIONS).map((handle) => ({ handle }));
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const c = COLLECTIONS[(await params).handle];
  return c ? { title: c.title, description: c.lead } : {};
}

export default async function Collection({ params }: { params: Promise<{ handle: string }> }) {
  const c = COLLECTIONS[(await params).handle];
  if (!c) notFound();
  const ratings = await ratingsByHandle();
  const products = (await getProducts()).filter((p) => (!c.kind || p.kind === c.kind) && (!c.filter || c.filter(p)));
  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">{c.eyebrow}</p>
        <h1 className="display h1" style={{ marginTop: 14 }}>{c.title}</h1>
        <p className="lead" style={{ marginTop: 18 }}>{c.lead}</p>
      </header>
      <ShopGrid items={products.map((p) => ({ p, pillar: pillarOf(p), rating: ratings[p.handle] }))} fixedKind={c.kind} />
    </div>
  );
}
