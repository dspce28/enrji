import 'server-only';
import { cache } from 'react';

/**
 * Customer reviews, from Judge.me (the Shopify reviews app). Judge.me emails buyers after delivery,
 * collects their reviews, and holds them for moderation; this reads the ones published there.
 *
 * Set on Vercel (Settings → Environment Variables), from Judge.me → Settings → Integrations → View API token:
 *   JUDGEME_SHOP_DOMAIN     the store's myshopify.com domain, e.g. enrji.myshopify.com
 *   JUDGEME_PRIVATE_TOKEN   the private API token (server only; never sent to the browser)
 * Without them the site shows no review section at all, rather than an empty one.
 */

const API = process.env.JUDGEME_API_URL || 'https://api.judge.me/api/v1';
export const JUDGEME_API = API;
export const SHOP_DOMAIN = process.env.JUDGEME_SHOP_DOMAIN?.trim() || '';
const TOKEN = process.env.JUDGEME_PRIVATE_TOKEN?.trim() || '';
export const reviewsEnabled = !!(SHOP_DOMAIN && TOKEN);

export interface Review {
  id: number;
  handle: string;
  rating: number;
  title: string;
  body: string;
  name: string;
  verified: boolean;
  date: string;
  pictures: string[];
}
export interface RatingSummary { average: number; count: number; stars: [number, number, number, number, number] }

interface RawReview {
  id: number; title?: string | null; body?: string | null; rating: number; product_handle?: string | null;
  reviewer?: { name?: string | null } | null; verified?: string | null; curated?: string | null; hidden?: boolean;
  created_at?: string; pictures?: { hidden?: boolean; urls?: { compact?: string; huge?: string; original?: string } }[];
}

const VERIFIED = new Set(['confirmed-buyer', 'buyer', 'verified-purchase', 'semi-verified-purchase', 'admin']);

/** "Priya Sharma" → "Priya S." */
function publicName(full?: string | null) {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'ENRJI customer';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

/** Every published review in the store, refreshed every 10 minutes. */
export const allReviews = cache(async (): Promise<Review[]> => {
  if (!reviewsEnabled) return [];
  const out: Review[] = [];
  try {
    for (let page = 1; page <= 20; page++) {
      const q = new URLSearchParams({ shop_domain: SHOP_DOMAIN, per_page: '100', page: String(page) });
      const res = await fetch(`${API}/reviews?${q}`, { headers: { 'X-Api-Token': TOKEN }, next: { revalidate: 600, tags: ['reviews'] } });
      if (!res.ok) break;
      const { reviews = [] } = (await res.json()) as { reviews?: RawReview[] };
      for (const r of reviews) {
        if (r.curated !== 'ok' || r.hidden || !r.product_handle) continue;   // only what the store has published
        out.push({
          id: r.id,
          handle: r.product_handle,
          rating: Math.max(1, Math.min(5, Math.round(r.rating))),
          title: (r.title ?? '').trim(),
          body: (r.body ?? '').trim(),
          name: publicName(r.reviewer?.name),
          verified: VERIFIED.has(r.verified ?? ''),
          date: r.created_at ?? '',
          pictures: (r.pictures ?? []).filter((p) => !p.hidden).map((p) => p.urls?.compact || p.urls?.original || '').filter(Boolean),
        });
      }
      if (reviews.length < 100) break;
    }
  } catch {
    // Judge.me unreachable: show the page without reviews rather than fail it.
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
});

export async function reviewsFor(handle: string) {
  return (await allReviews()).filter((r) => r.handle === handle);
}

export function summarise(list: Review[]): RatingSummary | null {
  if (!list.length) return null;
  const stars: RatingSummary['stars'] = [0, 0, 0, 0, 0];
  for (const r of list) stars[r.rating - 1]++;
  return { average: list.reduce((a, r) => a + r.rating, 0) / list.length, count: list.length, stars };
}

/** Average rating and count per product handle (for product cards). */
export async function ratingsByHandle() {
  const by = new Map<string, Review[]>();
  for (const r of await allReviews()) by.set(r.handle, [...(by.get(r.handle) ?? []), r]);
  const out: Record<string, { average: number; count: number }> = {};
  for (const [h, list] of by) { const s = summarise(list)!; out[h] = { average: s.average, count: s.count }; }
  return out;
}
