import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProducts } from '@/lib/catalogue';
import { lookFor } from '@/lib/garmentData';
import { titleCase } from '@/lib/format';
import { VirtualFit, type FitItem, type FitModel } from '@/components/fit/VirtualFit';
import fit from '@/data/fit.json';

export const revalidate = 300;
export const metadata: Metadata = {
  title: 'Trial Room',
  description: 'Spin the rail, pick a piece and watch it scan onto our model. Or try any ENRJI tee or sweatshirt on your own photo.',
};

const MODELS = fit.models as Record<string, { label: string; pieces: string[] }>;

export default async function TrialRoomPage({ searchParams }: { searchParams: Promise<{ product?: string; on?: string }> }) {
  const { product, on } = await searchParams;
  const all = await getProducts();
  const byHandle = new Map(all.map((p) => [p.handle, p]));

  const models: FitModel[] = Object.entries(MODELS).map(([key, m]) => ({
    key,
    label: m.label,
    items: m.pieces.flatMap((h): FitItem[] => {
      const p = byHandle.get(h);
      if (!p || !p.available) return [];
      const look = lookFor(p);
      return [{
        id: p.id,
        handle: p.handle,
        name: titleCase(p.baseName),
        title: titleCase(p.title),
        kind: p.kind,
        image: p.images[0]?.src ?? null,
        model: `/fit/model/${h}.webp`,
        garment: `/fit/garment/${h}.webp`,
        // Most pieces come in one colour, which has no option name in the catalogue.
        colors: p.colors.length ? p.colors.map((c) => [c, look.colorHex[c] ?? look.defaultColor] as [string, string]) : [['As shown', look.defaultColor]],
        variants: p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, available: v.available, price: v.price, compareAt: v.compareAt, image: v.image })),
      }];
    }),
  })).filter((m) => m.items.length > 0);

  // A piece we have no model photos for still has the photo try-on.
  const home = product ? models.find((m) => m.items.some((i) => i.handle === product)) : null;
  if (product && !home) redirect(`/trial-room/photo?product=${encodeURIComponent(product)}`);
  const start = home ?? models.find((m) => m.key === on) ?? models[0];

  return <VirtualFit models={models} initialModel={start.key} initialHandle={product ?? null} />;
}
