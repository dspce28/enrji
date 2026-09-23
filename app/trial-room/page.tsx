import type { Metadata } from 'next';
import { getProducts } from '@/lib/catalogue';
import { TrialRoom, type TryProduct } from '@/components/TrialRoom';
import garments from '@/data/garments.json';
import prints from '@/data/prints.json';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Trial Room', description: 'Try any ENRJI tee or sweatshirt on your own photo. Private: your photo never leaves your device.' };

type Garment = { color: string; colors?: Record<string, string>; ink?: string };
const GARMENTS = garments as Record<string, Garment>;
const PRINTS = new Set<string>(prints);
const print = (name: string) => (PRINTS.has(name) ? `/prints/${name}.png` : null);

export default async function TrialRoomPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product } = await searchParams;
  const all = (await getProducts()).filter((p) => p.available);
  const items: TryProduct[] = all.map((p) => {
    const g: Garment = GARMENTS[p.handle] ?? { color: '#1c2a44' };
    // Print artwork was cut from the flat-lay photos on the store; colour variants may have their own.
    const artwork: Record<string, string> = {};
    const base = print(p.handle);
    if (base) artwork['*'] = base;
    for (const c of p.colors) { const a = print(`${p.handle}--${c.toLowerCase()}`); if (a) artwork[c] = a; }
    return {
      handle: p.handle,
      title: p.title,
      baseName: p.baseName,
      kind: p.kind,
      image: p.images[0]?.src ?? null,
      colors: p.colors,
      colorHex: g.colors ?? {},
      defaultColor: g.color,
      ink: g.ink ?? '#f4efe6',
      artwork,
      variants: p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, available: v.available, price: v.price, compareAt: v.compareAt, image: v.image })),
    };
  });
  return (
    <div className="container">
      <header className="page-head" style={{ paddingBottom: 32 }}>
        <p className="eyebrow">Virtual trial room</p>
        <h1 className="display h1" style={{ marginTop: 14 }}>See it <span className="serif gold">on you.</span></h1>
        <p className="lead" style={{ marginTop: 18 }}>Upload a photo, use your camera or try the mannequin. Drag the piece into place, or tap your two shoulders and we&apos;ll fit it for you.</p>
      </header>
      <TrialRoom products={items} initial={product} />
    </div>
  );
}
