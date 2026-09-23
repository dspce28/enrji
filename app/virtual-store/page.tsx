import type { Metadata } from 'next';
import { getProducts } from '@/lib/catalogue';
import { VirtualStoreLoader } from '@/components/VirtualStoreLoader';
import type { StoreProduct } from '@/components/VirtualStore';
import portraits from '@/data/portraits.json';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Virtual Store', description: 'Walk through the ENRJI store in 3D and shop straight from the walls.' };

const PORTRAITS = portraits as Record<string, { src: string }>;

export default async function VirtualStorePage() {
  const all = await getProducts();
  // One display per slogan: prefer pieces with a 3D photo, then the tee; keep the limited drop for centre stage.
  const seen = new Set<string>();
  const products: StoreProduct[] = [];
  const rank = (p: (typeof all)[number]) => Number(p.limited) * 8 + Number(!!PORTRAITS[p.handle]) * 4 + Number(p.available) * 2 + Number(p.kind === 'tee');
  for (const p of [...all].sort((a, b) => rank(b) - rank(a))) {
    const key = p.baseName.toLowerCase();
    if (!p.images[0] || (seen.has(key) && !p.limited)) continue;
    seen.add(key);
    const portrait = PORTRAITS[p.handle];
    products.push({
      handle: p.handle, title: p.title, baseName: p.baseName, kind: p.kind, image: portrait?.src || p.images[0].src, price: p.price, compareAt: p.compareAt, limited: p.limited, colors: p.colors,
      portrait: !!portrait,
      variants: p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, available: v.available, price: v.price, compareAt: v.compareAt, image: v.image })),
    });
  }
  return <VirtualStoreLoader products={products.slice(0, 18)} />;
}
