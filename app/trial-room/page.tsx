import type { Metadata } from 'next';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getProducts } from '@/lib/catalogue';
import { TrialRoom, type TryProduct } from '@/components/TrialRoom';
import { TRYON } from '@/data/tryon';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Trial Room', description: 'Try any ENRJI tee or sweatshirt on your own photo. Private: your photo never leaves your device.' };

export default async function TrialRoomPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product } = await searchParams;
  const all = (await getProducts()).filter((p) => p.available);
  const items: TryProduct[] = all.map((p) => {
    const cfg = TRYON[p.handle] ?? {};
    const art = `/prints/${p.handle}.png`;
    return {
      handle: p.handle,
      title: p.title,
      baseName: p.baseName,
      kind: p.kind,
      image: p.images[0]?.src ?? null,
      colors: p.colors,
      defaultColor: cfg.color ?? '#1b2240',
      ink: cfg.ink ?? '#f4efe6',
      artwork: existsSync(join(process.cwd(), 'public', art)) ? art : null,
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
