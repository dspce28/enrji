import type { Metadata } from 'next';
import { getProducts } from '@/lib/catalogue';
import { TrialRoom, type TryProduct, type SamplePhoto } from '@/components/TrialRoom';
import { lookFor } from '@/lib/garmentData';
import garmentPhotos from '@/data/garment-photos.json';
import portraits from '@/data/portraits.json';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Trial Room', description: 'Upload a photo and see yourself in any ENRJI tee or sweatshirt, created by AI.' };

const GARMENTS = garmentPhotos as Record<string, { color: string }>;
const PORTRAITS = portraits as Record<string, unknown>;
// Sample people to try pieces on, from the store's own model photography (public/store).
const SAMPLES = ['family-is-my-strength-sweatshirt', 'selling-is-serving-tee', 'believe', 'i-am-energy-sweatshirt'];

export default async function TrialRoomPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product } = await searchParams;
  const all = (await getProducts()).filter((p) => p.available);
  const items: TryProduct[] = all.map((p) => {
    const look = lookFor(p);
    return {
      handle: p.handle,
      title: p.title,
      baseName: p.baseName,
      kind: p.kind,
      image: p.images[0]?.src ?? null,
      colors: p.colors,
      colorHex: look.colorHex,
      defaultColor: look.defaultColor,
      ink: look.ink,
      artwork: look.artwork,
      garmentPhoto: GARMENTS[p.handle] ? { src: `/garments/${p.handle}.jpg`, color: GARMENTS[p.handle].color } : null,
      variants: p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, available: v.available, price: v.price, compareAt: v.compareAt, image: v.image })),
    };
  });
  const samples: SamplePhoto[] = SAMPLES.filter((h) => PORTRAITS[h]).map((h) => ({ src: `/store/${h}.jpg`, label: h.replace(/-/g, ' ') }));
  return (
    <div className="container">
      <header className="page-head" style={{ paddingBottom: 32 }}>
        <p className="eyebrow">Virtual trial room</p>
        <h1 className="display h1" style={{ marginTop: 14 }}>See it <em className="gold-text">on you</em></h1>
        <p className="lead" style={{ marginTop: 18 }}>Upload a photo, choose a piece, and our AI stylist dresses you in it, keeping your face, pose and background.</p>
      </header>
      <TrialRoom products={items} samples={samples} initial={product} />
    </div>
  );
}
