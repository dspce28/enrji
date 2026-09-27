import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { normalisePhone } from './auth';
import { StoreError, str } from './api';
import { STATES } from '../states';


export type AddressInput = Omit<typeof schema.addresses.$inferInsert, 'id' | 'userId' | 'createdAt'>;

/** Validate an address from a form; throws StoreError with a message for the first problem. */
export function parseAddress(b: Record<string, unknown>): AddressInput {
  const a = {
    label: str(b.label, 30) || null,
    name: str(b.name, 80),
    phone: normalisePhone(str(b.phone, 20)) ?? '',
    line1: str(b.line1, 150),
    line2: str(b.line2, 150) || null,
    landmark: str(b.landmark, 100) || null,
    city: str(b.city, 60),
    state: str(b.state, 60),
    pincode: str(b.pincode, 6),
    isDefault: b.isDefault === true,
  };
  if (a.name.length < 2) throw new StoreError('Please add the name for delivery.');
  if (!a.phone) throw new StoreError('Please add a valid 10-digit mobile number for delivery.');
  if (a.line1.length < 5) throw new StoreError('Please add the house number and street.');
  if (a.city.length < 2) throw new StoreError('Please add the city.');
  if (!STATES.includes(a.state)) throw new StoreError('Please choose the state.');
  if (!/^[1-9]\d{5}$/.test(a.pincode)) throw new StoreError('Please add a valid 6-digit pincode.');
  return a;
}

export async function listAddresses(userId: string) {
  return db().select().from(schema.addresses).where(eq(schema.addresses.userId, userId))
    .orderBy(desc(schema.addresses.isDefault), desc(schema.addresses.createdAt));
}

export async function saveAddress(userId: string, a: AddressInput, id?: string) {
  return db().transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.addresses).where(eq(schema.addresses.userId, userId));
    if (!id && n >= 20) throw new StoreError('You can save up to 20 addresses.');
    const makeDefault = a.isDefault || n === 0 || (n === 1 && !!id);
    if (makeDefault) await tx.update(schema.addresses).set({ isDefault: false }).where(eq(schema.addresses.userId, userId));
    const values = { ...a, isDefault: makeDefault };
    if (id) {
      const [row] = await tx.update(schema.addresses).set(values).where(and(eq(schema.addresses.id, id), eq(schema.addresses.userId, userId))).returning();
      if (!row) throw new StoreError('Address not found.', 404);
      return row;
    }
    const [row] = await tx.insert(schema.addresses).values({ ...values, userId }).returning();
    return row;
  });
}

export async function deleteAddress(userId: string, id: string) {
  await db().transaction(async (tx) => {
    const [gone] = await tx.delete(schema.addresses).where(and(eq(schema.addresses.id, id), eq(schema.addresses.userId, userId))).returning();
    if (gone?.isDefault) {
      const [first] = await tx.select().from(schema.addresses).where(eq(schema.addresses.userId, userId)).orderBy(asc(schema.addresses.createdAt)).limit(1);
      if (first) await tx.update(schema.addresses).set({ isDefault: true }).where(eq(schema.addresses.id, first.id));
    }
  });
}

// ---------- Wishlist ----------
export async function wishlistIds(userId: string) {
  const rows = await db().select({ id: schema.wishlist.productId }).from(schema.wishlist).where(eq(schema.wishlist.userId, userId)).orderBy(desc(schema.wishlist.createdAt));
  return rows.map((r) => r.id);
}

export async function setWishlisted(userId: string, productId: number, on: boolean) {
  if (on) {
    const [p] = await db().select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.id, productId));
    if (!p) throw new StoreError('Product not found.', 404);
    await db().insert(schema.wishlist).values({ userId, productId }).onConflictDoNothing();
  } else {
    await db().delete(schema.wishlist).where(and(eq(schema.wishlist.userId, userId), eq(schema.wishlist.productId, productId)));
  }
}

// ---------- Saved cart ----------
export interface CartLineOut {
  variantId: number; quantity: number; handle: string; title: string; size: string; color: string | null;
  price: number; compareAt: number | null; image: string | null; stock: number;
}

/** The account's saved cart with current prices and stock (rupees, for the cart UI). */
export async function savedCart(userId: string): Promise<CartLineOut[]> {
  const rows = await db().select({ item: schema.cartItems, v: schema.variants, p: schema.products })
    .from(schema.cartItems)
    .innerJoin(schema.variants, eq(schema.variants.id, schema.cartItems.variantId))
    .innerJoin(schema.products, eq(schema.products.id, schema.variants.productId))
    .where(eq(schema.cartItems.userId, userId)).orderBy(asc(schema.cartItems.updatedAt));
  const firstImg = rows.length ? await db().select().from(schema.productImages)
    .where(inArray(schema.productImages.productId, rows.map((r) => r.p.id))).orderBy(asc(schema.productImages.position)) : [];
  return rows.filter((r) => r.p.status === 'active' && r.v.active).map(({ item, v, p }) => ({
    variantId: v.id, quantity: item.quantity, handle: p.handle, title: p.title, size: v.size, color: v.color,
    price: v.price / 100, compareAt: v.compareAt && v.compareAt > v.price ? v.compareAt / 100 : null,
    image: v.image ?? firstImg.find((i) => i.productId === p.id)?.src ?? null, stock: v.stock,
  }));
}

/** Replace the saved cart with these lines (unknown variants are ignored; up to 10 of each). */
export async function replaceCart(userId: string, lines: { variantId: number; quantity: number }[]) {
  const clean = new Map<number, number>();
  for (const l of lines.slice(0, 50)) {
    const id = Number(l.variantId), q = Math.floor(Number(l.quantity));
    if (Number.isSafeInteger(id) && q > 0) clean.set(id, Math.min(10, (clean.get(id) ?? 0) + q));
  }
  await db().transaction(async (tx) => {
    await tx.delete(schema.cartItems).where(eq(schema.cartItems.userId, userId));
    if (!clean.size) return;
    const known = await tx.select({ id: schema.variants.id }).from(schema.variants).where(inArray(schema.variants.id, [...clean.keys()]));
    const rows = known.map((k) => ({ userId, variantId: k.id, quantity: clean.get(k.id)! }));
    if (rows.length) await tx.insert(schema.cartItems).values(rows);
  });
}
