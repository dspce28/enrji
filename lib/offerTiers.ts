import 'server-only';
import { unstable_cache } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, ownStore, schema } from './db';
import { MULTIBUY } from './config';

export interface Tier { qty: number; percent: number }

const fromDb = unstable_cache(async (): Promise<Tier[]> => {
  const now = new Date();
  const rows = await db().select().from(schema.offers).where(eq(schema.offers.active, true));
  const live = rows.find((o) => (!o.startsAt || o.startsAt <= now) && (!o.endsAt || o.endsAt >= now));
  return live ? [...live.rules.tiers].sort((a, b) => a.qty - b.qty) : [];
}, ['offer-tiers'], { revalidate: 300, tags: ['catalogue'] });

/** The "buy more, save more" tiers to advertise: the live offer from the admin, or the Shopify-era defaults. */
export async function offerTiers(): Promise<Tier[]> {
  if (!ownStore) return MULTIBUY.map((t) => ({ qty: t.qty, percent: t.off }));
  try { return await fromDb(); } catch { return []; }
}
