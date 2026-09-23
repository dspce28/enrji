import type { Metadata } from 'next';
import { getProducts } from '@/lib/catalogue';
import { titleCase } from '@/lib/format';
import { Studio, type StudioLook } from '@/components/lookbook/Studio';
import entries from '@/data/lookbook.json';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Lookbook', description: 'The ENRJI collection, worn. Scroll through the lookbook and shop every piece.' };

export default async function LookbookPage() {
  const products = await getProducts();
  const byHandle = new Map(products.map((p) => [p.handle, p]));
  const looks: StudioLook[] = [];
  for (const [handle, i] of entries as [string, number][]) {
    const p = byHandle.get(handle);
    const im = p?.images[i] ?? p?.images[0];
    if (p && im) looks.push({ handle, src: im.src, name: titleCase(p.baseName) });
  }
  return <Studio looks={looks} />;
}
