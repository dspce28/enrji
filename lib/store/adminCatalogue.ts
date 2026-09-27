import 'server-only';
import { and, asc, desc, eq, ilike, inArray, lte, or, type SQL } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db, schema } from '../db';
import { StoreError, str } from './api';
import { audit } from './admin';

const refresh = () => { try { revalidateTag('catalogue', { expire: 0 }); } catch { /* ignore */ } };
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

// ---------- Products ----------
export async function listProducts(f: { q?: string; status?: string }) {
  const c: SQL[] = [];
  if (f.q) c.push(or(ilike(schema.products.title, `%${f.q}%`), ilike(schema.products.handle, `%${f.q}%`))!);
  if (f.status) c.push(eq(schema.products.status, f.status as 'active'));
  const rows = await db().select().from(schema.products).where(c.length ? and(...c) : undefined).orderBy(desc(schema.products.createdAt));
  const ids = rows.map((r) => r.id);
  const [vars, imgs] = ids.length ? await Promise.all([
    db().select().from(schema.variants).where(inArray(schema.variants.productId, ids)),
    db().select().from(schema.productImages).where(and(inArray(schema.productImages.productId, ids), eq(schema.productImages.position, 0))),
  ]) : [[], []];
  return rows.map((p) => {
    const v = vars.filter((x) => x.productId === p.id && x.active);
    const prices = v.map((x) => x.price);
    return { ...p, image: imgs.find((i) => i.productId === p.id)?.src ?? null, variants: v.length, stock: v.reduce((s, x) => s + x.stock, 0), minPrice: prices.length ? Math.min(...prices) : 0, maxPrice: prices.length ? Math.max(...prices) : 0 };
  });
}

export async function productForEdit(id: number) {
  const [p] = await db().select().from(schema.products).where(eq(schema.products.id, id));
  if (!p) return null;
  const [images, variants] = await Promise.all([
    db().select().from(schema.productImages).where(eq(schema.productImages.productId, id)).orderBy(asc(schema.productImages.position)),
    db().select().from(schema.variants).where(eq(schema.variants.productId, id)).orderBy(asc(schema.variants.position)),
  ]);
  return { ...p, images, variants };
}

export interface ProductInput {
  title: string; handle: string; kind: 'tee' | 'sweatshirt'; status: 'active' | 'draft' | 'archived'; limited: boolean;
  tags: string[]; story: string[]; details: string[]; care: string | null; hsn: string; seoTitle: string | null; seoDescription: string | null;
  images: { src: string; alt: string }[];
  variants: { id?: number; size: string; color: string | null; sku: string | null; price: number; compareAt: number | null; active: boolean; openingStock?: number }[];
}

export function parseProduct(b: Record<string, unknown>): ProductInput {
  const lines = (v: unknown, max = 60) => (Array.isArray(v) ? v : String(v ?? '').split('\n')).map((x) => str(x, 2000)).filter(Boolean).slice(0, max);
  const title = str(b.title, 150);
  if (title.length < 2) throw new StoreError('Please add a product name.');
  const kind = b.kind === 'sweatshirt' ? 'sweatshirt' : 'tee';
  const variants = (Array.isArray(b.variants) ? b.variants : []).slice(0, 80).map((v: Record<string, unknown>) => {
    const price = Math.round(Number(v.price) * 100), compare = v.compareAt === '' || v.compareAt == null ? null : Math.round(Number(v.compareAt) * 100);
    if (!str(v.size, 20)) throw new StoreError('Every variant needs a size.');
    if (!(price > 0)) throw new StoreError(`Size ${v.size}: price must be more than zero.`);
    if (compare != null && !(compare >= price)) throw new StoreError(`Size ${v.size}: MRP must be at least the selling price (or leave it empty).`);
    return {
      id: v.id ? Number(v.id) : undefined, size: str(v.size, 20), color: str(v.color, 40) || null, sku: str(v.sku, 60) || null,
      price, compareAt: compare, active: v.active !== false, openingStock: v.openingStock != null ? Math.max(0, Math.floor(Number(v.openingStock) || 0)) : undefined,
    };
  });
  if (!variants.length) throw new StoreError('Add at least one size.');
  const seen = new Set<string>();
  for (const v of variants) { const k = `${v.color ?? ''}|${v.size}`; if (seen.has(k)) throw new StoreError(`Size ${v.size}${v.color ? ` in ${v.color}` : ''} is listed twice.`); seen.add(k); }
  return {
    title, handle: slug(str(b.handle, 100) || title), kind, status: (['active', 'draft', 'archived'].includes(String(b.status)) ? b.status : 'draft') as ProductInput['status'],
    limited: b.limited === true, tags: lines(typeof b.tags === 'string' ? b.tags.split(',') : b.tags, 30).map((t) => t.toLowerCase()),
    story: String(b.story ?? '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean).slice(0, 20), details: lines(b.details, 30),
    care: str(b.care, 500) || null, hsn: str(b.hsn, 8) || (kind === 'sweatshirt' ? '6110' : '6109'),
    seoTitle: str(b.seoTitle, 70) || null, seoDescription: str(b.seoDescription, 170) || null,
    images: (Array.isArray(b.images) ? b.images : []).slice(0, 20).map((i: Record<string, unknown>) => ({ src: str(i.src, 500), alt: str(i.alt, 150) })).filter((i) => /^https?:\/\//.test(i.src) || i.src.startsWith('/')),
    variants,
  };
}

const baseNameOf = (title: string) => title.replace(/\s+(sweatshirt|tee|t-shirt)\s*$/i, '').trim();

/** Create or update a product with its images and variants. Variants are never deleted (orders point at them): unticked ones are hidden. */
export async function saveProduct(p: ProductInput, userId: string, id?: number) {
  const saved = await db().transaction(async (tx) => {
    const [clash] = await tx.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.handle, p.handle));
    if (clash && clash.id !== id) throw new StoreError(`The web address “${p.handle}” is already used by another product.`);
    const fields = { title: p.title, handle: p.handle, baseName: baseNameOf(p.title), kind: p.kind, status: p.status, limited: p.limited, tags: p.tags, story: p.story, details: p.details, care: p.care, hsn: p.hsn, seoTitle: p.seoTitle, seoDescription: p.seoDescription, updatedAt: new Date() };
    let productId = id;
    if (id) {
      const [row] = await tx.update(schema.products).set(fields).where(eq(schema.products.id, id)).returning({ id: schema.products.id });
      if (!row) throw new StoreError('Product not found.', 404);
    } else {
      productId = (await tx.insert(schema.products).values(fields).returning({ id: schema.products.id }))[0].id;
    }
    await tx.delete(schema.productImages).where(eq(schema.productImages.productId, productId!));
    if (p.images.length) await tx.insert(schema.productImages).values(p.images.map((im, i) => ({ productId: productId!, src: im.src, alt: im.alt, position: i })));

    const existing = await tx.select().from(schema.variants).where(eq(schema.variants.productId, productId!));
    for (const [i, v] of p.variants.entries()) {
      if (v.sku) {
        const [skuClash] = await tx.select({ id: schema.variants.id }).from(schema.variants).where(eq(schema.variants.sku, v.sku));
        if (skuClash && skuClash.id !== v.id) throw new StoreError(`SKU ${v.sku} is already used.`);
      }
      const vals = { size: v.size, color: v.color, sku: v.sku, price: v.price, compareAt: v.compareAt, active: v.active, position: i };
      if (v.id && existing.some((e) => e.id === v.id)) {
        await tx.update(schema.variants).set(vals).where(eq(schema.variants.id, v.id));
      } else {
        const [nv] = await tx.insert(schema.variants).values({ ...vals, productId: productId!, stock: v.openingStock ?? 0 }).returning({ id: schema.variants.id });
        if (v.openingStock) await tx.insert(schema.inventoryMovements).values({ variantId: nv.id, delta: v.openingStock, reason: 'restock', note: 'Opening stock', byUser: userId });
      }
    }
    // Variants dropped from the form are hidden, not deleted.
    const keep = new Set(p.variants.map((v) => v.id).filter(Boolean));
    for (const e of existing) if (!keep.has(e.id) && e.active) await tx.update(schema.variants).set({ active: false }).where(eq(schema.variants.id, e.id));
    return productId!;
  });
  await audit(userId, id ? 'product.update' : 'product.create', 'product', saved, { title: p.title, status: p.status, prices: p.variants.map((v) => [v.size, v.price, v.compareAt]) });
  refresh();
  return saved;
}

// ---------- Inventory ----------
export async function inventory(f: { q?: string; low?: boolean; out?: boolean }) {
  const c: SQL[] = [eq(schema.variants.active, true)];
  if (f.q) c.push(or(ilike(schema.products.title, `%${f.q}%`), ilike(schema.variants.sku, `%${f.q}%`))!);
  if (f.low) c.push(lte(schema.variants.stock, 3));
  if (f.out) c.push(eq(schema.variants.stock, 0));
  return db().select({ v: schema.variants, title: schema.products.title, handle: schema.products.handle, status: schema.products.status, productId: schema.products.id })
    .from(schema.variants).innerJoin(schema.products, eq(schema.products.id, schema.variants.productId))
    .where(and(...c)).orderBy(asc(schema.products.title), asc(schema.variants.color), asc(schema.variants.position)).limit(1000);
}

export async function movements(variantId: number) {
  return db().select({ m: schema.inventoryMovements, by: schema.users.name }).from(schema.inventoryMovements)
    .leftJoin(schema.users, eq(schema.users.id, schema.inventoryMovements.byUser))
    .where(eq(schema.inventoryMovements.variantId, variantId)).orderBy(desc(schema.inventoryMovements.at)).limit(100);
}

const REASONS = ['restock', 'adjust', 'damaged', 'count'] as const;
/** Set a stock count, or add/remove units, with a reason (kept in the movement history). */
export async function adjustStock(variantId: number, mode: 'set' | 'add', value: number, reason: string, note: string, userId: string) {
  if (!REASONS.includes(reason as (typeof REASONS)[number])) throw new StoreError('Choose a reason.');
  if (!Number.isInteger(value) || Math.abs(value) > 100000) throw new StoreError('Enter a whole number.');
  const res = await db().transaction(async (tx) => {
    const [v] = await tx.select().from(schema.variants).where(eq(schema.variants.id, variantId)).for('update');
    if (!v) throw new StoreError('Variant not found.', 404);
    const next = mode === 'set' ? value : v.stock + value;
    if (next < 0) throw new StoreError(`That would leave ${next} in stock.`);
    const delta = next - v.stock;
    if (!delta) return { stock: v.stock };
    await tx.update(schema.variants).set({ stock: next }).where(eq(schema.variants.id, variantId));
    await tx.insert(schema.inventoryMovements).values({ variantId, delta, reason: reason as 'adjust', note: note || null, byUser: userId });
    return { stock: next };
  });
  refresh();
  return res;
}

export async function exportStock() {
  const rows = await inventory({});
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return ['sku,product,color,size,stock', ...rows.map((r) => [r.v.sku, r.title, r.v.color, r.v.size, r.v.stock].map(esc).join(','))].join('\n');
}

/** CSV with columns sku,stock (other columns ignored): sets each count. Returns what changed and what didn't match. */
export async function importStock(csv: string, userId: string) {
  const rows = csv.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.split(',').map((x) => x.trim().replace(/^"|"$/g, '')));
  const head = rows.shift()?.map((h) => h.toLowerCase()) ?? [];
  const si = head.indexOf('sku'), ci = head.indexOf('stock');
  if (si < 0 || ci < 0) throw new StoreError('The file needs “sku” and “stock” columns (export the stock file to get the format).');
  let changed = 0; const unknown: string[] = []; const bad: string[] = [];
  for (const r of rows) {
    const sku = r[si], n = Number(r[ci]);
    if (!sku) continue;
    if (!Number.isInteger(n) || n < 0) { bad.push(sku); continue; }
    const [v] = await db().select({ id: schema.variants.id, stock: schema.variants.stock }).from(schema.variants).where(eq(schema.variants.sku, sku));
    if (!v) { unknown.push(sku); continue; }
    if (v.stock !== n) { await adjustStock(v.id, 'set', n, 'count', 'Stock file import', userId); changed++; }
  }
  await audit(userId, 'inventory.import', 'inventory', null, { changed, unknown: unknown.length, bad: bad.length });
  return { changed, unknown, bad };
}

