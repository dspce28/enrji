import type { Metadata } from 'next';
import { getProducts } from '@/lib/catalogue';
import { inr, titleCase } from '@/lib/format';
import { Lookbook, type Look } from '@/components/Lookbook';
import entries from '@/data/lookbook.json';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Lookbook', description: 'The ENRJI collection, worn. Browse the lookbook and shop every piece.' };

export default async function LookbookPage() {
  const products = await getProducts();
  const byHandle = new Map(products.map((p) => [p.handle, p]));
  const looks: Look[] = [];
  for (const [handle, i] of entries as [string, number][]) {
    const p = byHandle.get(handle);
    const im = p?.images[i] ?? p?.images[0];
    if (!p || !im) continue;
    looks.push({
      handle, src: im.src, name: titleCase(p.baseName),
      kind: p.limited ? 'Limited edition' : p.kind === 'tee' ? 'Half-sleeve tee' : 'Sweatshirt',
      price: inr(p.price), available: p.available,
    });
  }
  return <Lookbook looks={looks} />;
}
