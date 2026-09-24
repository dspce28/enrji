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
  // Every slogan first (preferring pieces with a 3D photo, then the tee; the limited drop takes centre stage),
  // then the other version of each slogan, until the hall is full: centre stage, four figures, 28 wall frames.
  const seen = new Set<string>();
  const rank = (p: (typeof all)[number]) => Number(p.limited) * 8 + Number(!!PORTRAITS[p.handle]) * 4 + Number(p.available) * 2 + Number(p.kind === 'tee');
  const sorted = [...all].filter((p) => p.images[0]).sort((a, b) => rank(b) - rank(a));
  const first = sorted.filter((p) => { const k = p.baseName.toLowerCase(); if (seen.has(k) && !p.limited) return false; seen.add(k); return true; });
  const products: StoreProduct[] = [];
  for (const p of [...first, ...sorted.filter((p) => !first.includes(p))]) {
    const portrait = PORTRAITS[p.handle];
    products.push({
      handle: p.handle, title: p.title, baseName: p.baseName, kind: p.kind, image: portrait?.src || p.images[0].src, price: p.price, compareAt: p.compareAt, limited: p.limited, colors: p.colors,
      portrait: !!portrait,
      variants: p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, available: v.available, price: v.price, compareAt: v.compareAt, image: v.image })),
    });
  }
  return <VirtualStoreLoader products={products.slice(0, 33)} />;
}
