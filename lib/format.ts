export const inr = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

export const percentOff = (price: number, compareAt: number | null) =>
  compareAt && compareAt > price ? Math.round((1 - price / compareAt) * 100) : 0;

/** Shopify CDN resizes on request: add a width to any cdn.shopify.com URL. */
export function cdn(src: string, width: number) {
  if (!src.includes('cdn.shopify.com')) return src;
  const u = new URL(src.startsWith('//') ? `https:${src}` : src);
  u.searchParams.set('width', String(width));
  return u.toString();
}

export function srcSet(src: string, widths = [360, 540, 720, 960, 1280, 1600]) {
  return widths.map((w) => `${cdn(src, w)} ${w}w`).join(', ');
}

export const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s(&-])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\bGtb\b/, 'GTB');
