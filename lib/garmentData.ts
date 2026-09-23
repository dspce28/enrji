import 'server-only';
import type { Product } from './catalogue';
import garments from '@/data/garments.json';
import prints from '@/data/prints.json';

/** Colour and print artwork for rendering a product (Trial Room, 360° view, virtual store). */
export type { GarmentLook } from './look';
import type { GarmentLook } from './look';

type Garment = { color: string; colors?: Record<string, string>; ink?: string };
const GARMENTS = garments as Record<string, Garment>;
const PRINTS = new Set<string>(prints);
const printUrl = (name: string) => (PRINTS.has(name) ? `/prints/${name}.png` : null);

export function lookFor(p: Pick<Product, 'handle' | 'colors'>): GarmentLook {
  const g: Garment = GARMENTS[p.handle] ?? { color: '#1c2a44' };
  const artwork: Record<string, string> = {};
  const base = printUrl(p.handle);
  if (base) artwork['*'] = base;
  for (const c of p.colors) { const a = printUrl(`${p.handle}--${c.toLowerCase()}`); if (a) artwork[c] = a; }
  return { defaultColor: g.color, colorHex: g.colors ?? {}, ink: g.ink ?? '#f4efe6', artwork };
}

