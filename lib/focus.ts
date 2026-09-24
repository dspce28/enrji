import focal from '@/data/focal.json';

const FOCAL = focal as Record<string, number[]>;

/**
 * Keep the face in view when a photo is cropped to fit its frame (object-fit: cover), and zoom towards it.
 * Points come from scripts/focal-points.py; photos without a face keep the centre crop.
 */
export function focus(src: string | null | undefined): React.CSSProperties | undefined {
  if (!src) return undefined;
  const p = FOCAL[src.split('?')[0].split('/files/').pop() ?? ''];
  if (!p) return undefined;
  const at = `${Math.round(p[0] * 100)}% ${Math.round(p[1] * 100)}%`;
  return { objectPosition: at, transformOrigin: at };
}
