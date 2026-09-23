import type { Metadata } from 'next';
import { getProducts, PILLARS, pillarOf, type Pillar } from '@/lib/catalogue';
import { Energies, type EnergySlide } from '@/components/lookbook/Energies';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Four Energies · Lookbook', description: 'Mental, emotional, physical and spiritual: find the ENRJI you want to carry today.' };

// One editorial photograph per energy: [product handle, image index].
const COVER: Record<Pillar, [string, number]> = {
  mental: ['mindset-is-everything-sweatshirt', 1],
  emotional: ['love-is-my-superpower', 3],
  physical: ['healthy-is-new-rich-sweatshirt', 0],
  spiritual: ['believe', 1],
};

export default async function EnergiesPage() {
  const products = await getProducts();
  const byHandle = new Map(products.map((p) => [p.handle, p]));
  const slides: EnergySlide[] = (Object.keys(PILLARS) as Pillar[]).map((k) => {
    const [h, i] = COVER[k];
    const inPillar = products.filter((p) => pillarOf(p) === k);
    const img = byHandle.get(h)?.images[i]?.src ?? inPillar[0]?.images[0]?.src ?? '';
    return { key: k, name: PILLARS[k].title.replace(' ENRJI', ''), line: PILLARS[k].line, img, count: inPillar.length };
  }).filter((s) => s.img);
  return <Energies slides={slides} />;
}
