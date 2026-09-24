import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { ImageResponse } from 'next/og';
import path from 'node:path';

/**
 * The picture shown when an ENRJI link is shared (WhatsApp, Instagram, X, iMessage…): 1200 × 630,
 * the site's ivory with a model photograph and the words in the brand's faces.
 * Used by app/opengraph-image.tsx (every page) and app/products/[handle]/opengraph-image.tsx.
 */

export const SHARE_SIZE = { width: 1200, height: 630 };
export const INK = '#1d1915';
export const GOLD = '#97763b';
export const IVORY = '#f5f0e8';
export const MUTED = '#6b6258';

const root = process.cwd();

export async function shareFonts() {
  const f = (file: string) => readFile(path.join(root, 'assets/fonts', file));
  const [serif, serifItalic, sans, sansMedium] = await Promise.all([
    f('CormorantGaramond-Medium.ttf'), f('CormorantGaramond-MediumItalic.ttf'), f('Jost-Regular.ttf'), f('Jost-Medium.ttf'),
  ]);
  return [
    { name: 'Cormorant', data: serif, weight: 500 as const, style: 'normal' as const },
    { name: 'Cormorant', data: serifItalic, weight: 500 as const, style: 'italic' as const },
    { name: 'Jost', data: sans, weight: 400 as const, style: 'normal' as const },
    { name: 'Jost', data: sansMedium, weight: 500 as const, style: 'normal' as const },
  ];
}

/** A photo from /public as a data URL (null if it isn't there). */
export async function publicImage(rel: string) {
  try {
    const buf = await readFile(path.join(root, 'public', rel));
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Small caps line, as used across the site. */
export function Eyebrow({ children, color = MUTED }: { children: React.ReactNode; color?: string }) {
  return <div style={{ display: 'flex', fontFamily: 'Jost', fontWeight: 500, fontSize: 18, letterSpacing: 6, textTransform: 'uppercase', color }}>{children}</div>;
}

export function Wordmark({ size = 34 }: { size?: number }) {
  return <div style={{ display: 'flex', fontFamily: 'Cormorant', fontWeight: 500, fontSize: size, letterSpacing: size * 0.42, color: INK }}>ENRJI</div>;
}

/**
 * ImageResponse makes PNGs, which for photographs run to 400–800 KB. WhatsApp drops previews much over
 * ~300 KB, so send a JPEG instead (about a tenth of the size).
 */
export async function asJpeg(img: ImageResponse) {
  const jpg = await sharp(Buffer.from(await img.arrayBuffer())).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' } });
}
