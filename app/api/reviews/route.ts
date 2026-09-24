import { NextResponse, type NextRequest } from 'next/server';
import { getProduct } from '@/lib/catalogue';
import { JUDGEME_API, SHOP_DOMAIN, reviewsEnabled } from '@/lib/reviews';

/**
 * POST /api/reviews — a shopper's review, passed on to Judge.me, where it waits for the store's moderation
 * (and is marked verified if the email matches an order). Nothing is published from here directly.
 */

const recent = new Map<string, number[]>();   // best-effort limit per IP on this server instance

export async function POST(req: NextRequest) {
  if (!reviewsEnabled) return NextResponse.json({ error: 'Reviews are not open yet.' }, { status: 503 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const now = Date.now(), hits = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= 5) return NextResponse.json({ error: 'Too many reviews from here. Please try again later.' }, { status: 429 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  if (b.website) return NextResponse.json({ ok: true });   // honeypot: bots fill every field
  const str = (k: string, max: number) => (typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, max) : '');
  const handle = str('handle', 200), name = str('name', 60), email = str('email', 120), title = str('title', 100), body = str('body', 2000);
  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({ error: 'Please choose a star rating.' }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ error: 'Please add your name.' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Please add a valid email.' }, { status: 400 });
  if (body.length < 10) return NextResponse.json({ error: 'Please write a few words about the piece.' }, { status: 400 });
  const p = await getProduct(handle);
  if (!p) return NextResponse.json({ error: 'Unknown product' }, { status: 404 });

  const res = await fetch(`${JUDGEME_API}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_domain: SHOP_DOMAIN, platform: 'shopify', id: p.id,
      name, email, rating, title, body, reviewer_name_format: 'last_initial',
      ip_addr: ip === 'unknown' ? undefined : ip,
    }),
  }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: 'We couldn’t send your review just now. Please try again in a minute.' }, { status: 502 });
  recent.set(ip, [...hits, now]);
  return NextResponse.json({ ok: true });
}
