/**
 * Turns Shopify's public products.json into ENRJI's Product shape. No imports, so the database import script
 * (scripts/db-import-shopify.mjs) can load it too.
 */

export type Kind = 'tee' | 'sweatshirt';

export interface Img { src: string; width: number; height: number; alt: string; colors: string[] }

export interface Variant {
  id: number;
  size: string;
  color: string | null;
  price: number;          // rupees
  compareAt: number | null;
  available: boolean;
  image: string | null;
}

export interface Product {
  id: number;
  handle: string;
  title: string;
  baseName: string;       // slogan without "Sweatshirt"/"Tee", used to pair tee ↔ sweatshirt
  kind: Kind;
  limited: boolean;
  tags: string[];
  story: string[];
  details: string[];
  care: string | null;
  images: Img[];
  variants: Variant[];
  sizes: string[];
  colors: string[];
  price: number;
  compareAt: number | null;
  available: boolean;
  availableCount: number;
  createdAt: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export interface RawVariant {
  id: number; option1: string | null; option2: string | null; option3: string | null;
  price: string; compare_at_price: string | null; available: boolean;
  featured_image: { src: string } | null;
}
export interface RawProduct {
  id: number; handle: string; title: string; body_html: string | null; tags: string[]; created_at: string;
  options: { name: string; position: number; values: string[] }[];
  images: { src: string; width: number; height: number; variant_ids: number[] }[];
  variants: RawVariant[];
}

// Internal products that must never be shown or sold.
export const isHidden = (p: RawProduct) =>
  /do not ship|test order/i.test(p.title) || p.handle.startsWith('test-') || p.handle === 'test-order';

function decode(s: string) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
const clean = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Split Shopify description HTML into story paragraphs, detail bullets and care text. */
function parseBody(html: string) {
  const story: string[] = [];
  const details: string[] = [];
  let care: string | null = null;
  const blocks = html.match(/<(p|li)[^>]*>[\s\S]*?<\/\1>/gi) ?? [];
  for (const b of blocks) {
    const isLi = /^<li/i.test(b);
    const t = clean(b);
    if (!t || /^details$/i.test(t) || /^ENRJI® – feel it, live it$/i.test(t)) continue;
    const fabric = /^Fabric and fit:\s*(.*)$/i.exec(t);
    const careM = /^Care:\s*(.*)$/i.exec(t);
    if (fabric) details.push(...fabric[1].split(/(?<=\.)\s+/).filter(Boolean));
    else if (careM) care = careM[1];
    else if (isLi) details.push(t);
    else if (/GSM/.test(t) && t.includes('·')) details.push(...t.split('·').map((x) => x.trim()).filter(Boolean));
    else story.push(t);
  }
  return { story, details, care };
}

export function normalise(p: RawProduct): Product {
  const optIndex = (name: string) => p.options.find((o) => o.name.toLowerCase() === name)?.position ?? null;
  const sizeAt = optIndex('size');
  const colorAt = optIndex('color') ?? optIndex('colour');
  const opt = (v: RawVariant, pos: number | null) => (pos ? (v[`option${pos}` as 'option1'] ?? null) : null);

  const variants: Variant[] = p.variants.map((v) => ({
    id: v.id,
    size: opt(v, sizeAt) ?? 'One size',
    color: opt(v, colorAt),
    price: Number(v.price),
    compareAt: v.compare_at_price && Number(v.compare_at_price) > Number(v.price) ? Number(v.compare_at_price) : null,
    available: v.available,
    image: v.featured_image?.src ?? null,
  }));
  const colorOf = new Map(variants.map((v) => [v.id, v.color]));
  const images: Img[] = p.images.map((i) => ({
    src: i.src, width: i.width, height: i.height, alt: p.title,
    colors: [...new Set(i.variant_ids.map((id) => colorOf.get(id)).filter((c): c is string => !!c))],
  }));
  const text = clean(p.body_html ?? '');
  const kind: Kind = /sweatshirt/i.test(p.title) || /sweatshirt/i.test(text.slice(0, 400)) ? 'sweatshirt' : 'tee';
  const cheapest = variants.reduce((a, b) => (b.price < a.price ? b : a), variants[0]);
  const availableCount = variants.filter((v) => v.available).length;
  return {
    id: p.id,
    handle: p.handle,
    title: p.title.trim(),
    baseName: p.title.replace(/\s+(sweatshirt|tee|t-shirt)\s*$/i, '').trim(),
    kind,
    limited: p.tags.includes('limited-edition'),
    tags: p.tags,
    ...parseBody(p.body_html ?? ''),
    images,
    variants,
    sizes: [...new Set(variants.map((v) => v.size))],
    colors: [...new Set(variants.map((v) => v.color).filter((c): c is string => !!c))],
    price: cheapest?.price ?? 0,
    compareAt: cheapest?.compareAt ?? null,
    available: availableCount > 0,
    availableCount,
    createdAt: p.created_at,
  };
}

