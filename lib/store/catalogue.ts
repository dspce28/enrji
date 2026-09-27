import 'server-only';
import { asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Img, Product, Variant } from '../shopify';

/** Active products from the store database, in the same shape the pages already use. */
export async function catalogueFromDb(): Promise<Product[]> {
  const d = db();
  const rows = await d.select().from(schema.products).where(eq(schema.products.status, 'active'));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [imgs, vars] = await Promise.all([
    d.select().from(schema.productImages).where(inArray(schema.productImages.productId, ids)).orderBy(asc(schema.productImages.position)),
    d.select().from(schema.variants).where(inArray(schema.variants.productId, ids)).orderBy(asc(schema.variants.position)),
  ]);
  return rows.map((p) => {
    const images: Img[] = imgs.filter((i) => i.productId === p.id).map((i) => ({ src: i.src, width: i.width, height: i.height, alt: i.alt || p.title, colors: i.colors }));
    const variants: Variant[] = vars.filter((v) => v.productId === p.id && v.active).map((v) => ({
      id: v.id, size: v.size, color: v.color, price: v.price / 100,
      compareAt: v.compareAt && v.compareAt > v.price ? v.compareAt / 100 : null,
      available: v.stock > 0, image: v.image,
    }));
    const cheapest = variants.reduce<Variant | null>((a, b) => (!a || b.price < a.price ? b : a), null);
    const availableCount = variants.filter((v) => v.available).length;
    return {
      id: p.id, handle: p.handle, title: p.title, baseName: p.baseName, kind: p.kind, limited: p.limited, tags: p.tags,
      story: p.story, details: p.details, care: p.care, images, variants,
      sizes: [...new Set(variants.map((v) => v.size))],
      colors: [...new Set(variants.map((v) => v.color).filter((c): c is string => !!c))],
      price: cheapest?.price ?? 0, compareAt: cheapest?.compareAt ?? null,
      available: availableCount > 0, availableCount, createdAt: p.createdAt.toISOString(),
      seoTitle: p.seoTitle, seoDescription: p.seoDescription,
    };
  });
}

/** Live stock for the cart (never cached). */
export async function stockFor(ids: number[]) {
  if (!ids.length) return new Map<number, number>();
  const rows = await db().select({ id: schema.variants.id, stock: schema.variants.stock, active: schema.variants.active })
    .from(schema.variants).where(inArray(schema.variants.id, ids));
  return new Map(rows.map((r) => [r.id, r.active ? r.stock : 0]));
}
