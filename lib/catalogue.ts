import 'server-only';
import { unstable_cache } from 'next/cache';
import snapshot from '@/data/catalogue-snapshot.json';
import { STORE_URL } from './config';
import { ownStore } from './db';
import { catalogueFromDb } from './store/catalogue';

/**
 * Catalogue source. With a database connected (DATABASE_URL), ENRJI's own store; otherwise the live Shopify
 * store's public products feed. Either way pages re-read it every few minutes (ISR), and the admin refreshes
 * it immediately after edits (revalidateTag('catalogue')). If Shopify can't be reached, the committed
 * snapshot keeps the site up.
 */

export type { Kind, Img, Variant, Product } from './shopify';
import { isHidden, normalise, type Product, type RawProduct } from './shopify';

const REVALIDATE_SECONDS = 300;

async function fetchRaw(): Promise<RawProduct[]> {
  try {
    const res = await fetch(`${STORE_URL}/products.json?limit=250`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ['catalogue'] },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`products.json ${res.status}`);
    const data = (await res.json()) as { products: RawProduct[] };
    if (!Array.isArray(data.products) || !data.products.length) throw new Error('empty feed');
    return data.products;
  } catch (err) {
    console.warn('[catalogue] live feed unavailable, using snapshot:', (err as Error).message);
    return (snapshot as unknown as { products: RawProduct[] }).products;
  }
}

const fromDb = unstable_cache(catalogueFromDb, ['catalogue-db'], { revalidate: REVALIDATE_SECONDS, tags: ['catalogue'] });

/** All sellable products, in-stock first, newest first. */
export async function getProducts(): Promise<Product[]> {
  const list = ownStore ? await fromDb() : (await fetchRaw()).filter((p) => !isHidden(p)).map(normalise);
  return list.sort((a, b) => Number(b.available) - Number(a.available) || b.createdAt.localeCompare(a.createdAt));
}

export async function getProduct(handle: string) {
  return (await getProducts()).find((p) => p.handle === handle) ?? null;
}

/** The same slogan in the other garment (tee ↔ sweatshirt), if it exists. */
export function counterpart(all: Product[], p: Product) {
  return all.find((q) => q.handle !== p.handle && q.kind !== p.kind && q.baseName.toLowerCase() === p.baseName.toLowerCase()) ?? null;
}

// The four energies live in ./energies (client-safe); re-exported for the pages that already import them here.
export { PILLARS, pillarOf, type Pillar } from './energies';
