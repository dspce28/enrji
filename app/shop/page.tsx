import type { Metadata } from 'next';
import { getProducts, pillarOf } from '@/lib/catalogue';
import { ShopGrid } from '@/components/ShopGrid';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Shop all', description: 'Every ENRJI tee and sweatshirt: slogans to live by, in 100% combed cotton.' };

export default async function Shop() {
  const products = await getProducts();
  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">The collection</p>
        <h1 className="display h1" style={{ marginTop: 14 }}>Shop all</h1>
        <p className="lead" style={{ marginTop: 18 }}>Tees at ₹699, sweatshirts at ₹1,099. Pick the words you want to live by.</p>
      </header>
      <ShopGrid items={products.map((p) => ({ p, pillar: pillarOf(p) }))} />
    </div>
  );
}
