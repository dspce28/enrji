import type { Metadata } from 'next';
import { getProducts } from '@/lib/catalogue';
import { VirtualStoreLoader } from '@/components/VirtualStoreLoader';
import type { StoreProduct } from '@/components/VirtualStore';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Virtual Store', description: 'Walk through the ENRJI store in 3D and shop straight from the walls.' };

export default async function VirtualStorePage() {
  const all = await getProducts();
  // One poster per slogan: prefer the tee, keep the limited drop for centre stage.
  const seen = new Set<string>();
  const products: StoreProduct[] = [];
  for (const p of [...all].sort((a, b) => Number(b.limited) - Number(a.limited) || Number(b.available) - Number(a.available) || (a.kind === 'tee' ? -1 : 1))) {
    const key = p.baseName.toLowerCase();
    if (!p.images[0] || (seen.has(key) && !p.limited)) continue;
    seen.add(key);
    products.push({
      handle: p.handle, title: p.title, baseName: p.baseName, kind: p.kind, image: p.images[0].src, price: p.price, compareAt: p.compareAt, limited: p.limited, colors: p.colors,
      variants: p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, available: v.available, price: v.price, compareAt: v.compareAt, image: v.image })),
    });
  }
  return <VirtualStoreLoader products={products.slice(0, 18)} />;
}
