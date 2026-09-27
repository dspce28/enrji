import 'server-only';
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db, schema } from '../db';
import { StoreError, str } from './api';
import { audit } from './admin';
import { normalisePhone } from './auth';
import { getSettings, type StoreSettings } from './settings';
import { SOLD } from './adminData';

// ---------- Coupons ----------
export async function listCoupons() {
  const rows = await db().select().from(schema.coupons).orderBy(desc(schema.coupons.createdAt));
  const used = await db().select({ id: schema.couponRedemptions.couponId, n: sql<number>`count(*)::int` }).from(schema.couponRedemptions).groupBy(schema.couponRedemptions.couponId);
  return rows.map((c) => ({ ...c, used: used.find((u) => u.id === c.id)?.n ?? 0 }));
}

export function parseCoupon(b: Record<string, unknown>) {
  const code = str(b.code, 40).toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new StoreError('Code: 3–40 letters, numbers, - or _.');
  const type = (['percent', 'flat', 'free_shipping'].includes(String(b.type)) ? b.type : 'percent') as 'percent' | 'flat' | 'free_shipping';
  const num = (v: unknown) => (v === '' || v == null ? null : Number(v));
  const value = type === 'percent' ? Math.round(Number(b.value)) : type === 'flat' ? Math.round(Number(b.value) * 100) : 0;
  if (type === 'percent' && !(value > 0 && value <= 90)) throw new StoreError('Percent off must be between 1 and 90.');
  if (type === 'flat' && !(value > 0)) throw new StoreError('Enter the amount off.');
  const date = (v: unknown) => (v ? new Date(`${v}T00:00:00+05:30`) : null);
  const endDate = (v: unknown) => (v ? new Date(`${v}T23:59:59+05:30`) : null);
  const maxD = num(b.maxDiscount), minO = num(b.minOrder), lim = num(b.usageLimit);
  return {
    code, type, value, description: str(b.description, 200) || null,
    minOrder: minO ? Math.round(minO * 100) : 0, maxDiscount: maxD ? Math.round(maxD * 100) : null,
    appliesTo: (['all', 'tee', 'sweatshirt'].includes(String(b.appliesTo)) ? b.appliesTo : 'all') as 'all',
    startsAt: date(b.startsAt), endsAt: endDate(b.endsAt), usageLimit: lim && lim > 0 ? Math.round(lim) : null,
    perUserLimit: Math.max(1, Math.round(Number(b.perUserLimit) || 1)), firstOrderOnly: b.firstOrderOnly === true,
    combinable: b.combinable === true, active: b.active !== false,
  };
}

export async function saveCoupon(b: Record<string, unknown>, userId: string, id?: number) {
  const c = parseCoupon(b);
  const [clash] = await db().select({ id: schema.coupons.id }).from(schema.coupons).where(eq(schema.coupons.code, c.code));
  if (clash && clash.id !== id) throw new StoreError(`Code ${c.code} already exists.`);
  if (id) await db().update(schema.coupons).set(c).where(eq(schema.coupons.id, id));
  else id = (await db().insert(schema.coupons).values(c).returning({ id: schema.coupons.id }))[0].id;
  await audit(userId, 'coupon.save', 'coupon', id, c);
  return id;
}

// ---------- Offers ----------
export const listOffers = () => db().select().from(schema.offers).orderBy(asc(schema.offers.id));

export async function saveOffer(b: Record<string, unknown>, userId: string, id?: number) {
  const tiers = (Array.isArray(b.tiers) ? b.tiers : []).map((t: Record<string, unknown>) => ({ qty: Math.round(Number(t.qty)), percent: Math.round(Number(t.percent)) }))
    .filter((t) => t.qty >= 2 && t.percent > 0 && t.percent <= 60).sort((a, b) => a.qty - b.qty);
  if (!tiers.length) throw new StoreError('Add at least one tier (from 2 pieces, 1–60% off).');
  const vals = { name: str(b.name, 80) || 'Buy more, save more', type: 'multibuy' as const, rules: { tiers }, active: b.active !== false,
    startsAt: b.startsAt ? new Date(`${b.startsAt}T00:00:00+05:30`) : null, endsAt: b.endsAt ? new Date(`${b.endsAt}T23:59:59+05:30`) : null };
  if (id) await db().update(schema.offers).set(vals).where(eq(schema.offers.id, id));
  else id = (await db().insert(schema.offers).values(vals).returning({ id: schema.offers.id }))[0].id;
  await audit(userId, 'offer.save', 'offer', id, vals);
  try { revalidateTag('catalogue', { expire: 0 }); } catch { /* ignore */ }
  return id;
}

// ---------- Customers ----------
export async function listCustomers(q?: string) {
  const c: SQL[] = [eq(schema.users.role, 'customer')];
  if (q) { const like = `%${q.trim()}%`; c.push(or(ilike(schema.users.phone, like), ilike(schema.users.name, like), ilike(schema.users.email, like))!); }
  const rows = await db().select().from(schema.users).where(and(...c)).orderBy(desc(schema.users.createdAt)).limit(300);
  const stats = rows.length ? await db().select({ u: schema.orders.userId, n: sql<number>`count(*)::int`, spent: sql<number>`coalesce(sum(${schema.orders.total}), 0)::int`, last: sql<Date>`max(${schema.orders.placedAt})` })
    .from(schema.orders).where(and(SOLD, inArray(schema.orders.userId, rows.map((r) => r.id)))).groupBy(schema.orders.userId) : [];
  return rows.map((r) => { const s = stats.find((x) => x.u === r.id); return { ...r, orders: s?.n ?? 0, spent: s?.spent ?? 0, last: s?.last ?? null }; });
}

export async function customerDetail(id: string) {
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) return null;
  const [orders, addresses] = await Promise.all([
    db().select().from(schema.orders).where(eq(schema.orders.userId, id)).orderBy(desc(schema.orders.createdAt)).limit(100),
    db().select().from(schema.addresses).where(eq(schema.addresses.userId, id)),
  ]);
  return { ...u, orders, addresses, spent: orders.filter((o) => !['pending_payment', 'cancelled'].includes(o.status) && o.paymentMethod !== 'exchange').reduce((s, o) => s + o.total, 0) };
}

export async function setBlocked(id: string, blocked: boolean, adminId: string) {
  const [u] = await db().update(schema.users).set({ blocked }).where(and(eq(schema.users.id, id), eq(schema.users.role, 'customer'))).returning();
  if (!u) throw new StoreError('Customer not found.', 404);
  if (blocked) await db().delete(schema.sessions).where(eq(schema.sessions.userId, id));   // signs them out everywhere
  await audit(adminId, blocked ? 'customer.block' : 'customer.unblock', 'user', id);
}

// ---------- Staff ----------
export const listStaff = () => db().select().from(schema.users).where(inArray(schema.users.role, ['staff', 'admin'])).orderBy(asc(schema.users.role), asc(schema.users.name));

/** Give a mobile number staff/admin access, or take it away ('customer'). Creates the account if needed. */
export async function setRole(phoneInput: string, role: 'customer' | 'staff' | 'admin', name: string, adminId: string) {
  const phone = normalisePhone(phoneInput);
  if (!phone) throw new StoreError('Enter a valid 10-digit mobile number.');
  const [me] = await db().select().from(schema.users).where(eq(schema.users.id, adminId));
  if (me.phone === phone && role !== 'admin') throw new StoreError('You can’t remove your own admin access.');
  const [u] = await db().insert(schema.users).values({ phone, role, name: name || null })
    .onConflictDoUpdate({ target: schema.users.phone, set: { role, ...(name ? { name } : {}) } }).returning();
  if (role === 'customer') await db().delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
  await audit(adminId, 'staff.role', 'user', u.id, { phone, role });
}

export const auditTrail = () => db().select({ a: schema.auditLog, by: schema.users.name, phone: schema.users.phone }).from(schema.auditLog)
  .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId)).orderBy(desc(schema.auditLog.at)).limit(300);

// ---------- Settings ----------
export async function saveSettings(b: Partial<StoreSettings>, adminId: string) {
  const cur = await getSettings();
  const p = (v: unknown) => Math.max(0, Math.round(Number(v) * 100) || 0);
  const next: StoreSettings = {
    shipping: { flat: p(b.shipping?.flat), freeAbove: p(b.shipping?.freeAbove) },
    cod: { enabled: b.cod?.enabled === true, fee: p(b.cod?.fee), maxOrder: p(b.cod?.maxOrder) || cur.cod.maxOrder },
    returns: { windowDays: Math.min(60, Math.max(0, Math.round(Number(b.returns?.windowDays) || 0))), exchangeOnly: b.returns?.exchangeOnly === true },
    gst: { threshold: p(b.gst?.threshold) || cur.gst.threshold, rateUpTo: Math.round(Number(b.gst?.rateUpTo)), rateAbove: Math.round(Number(b.gst?.rateAbove)) },
    store: { name: str(b.store?.name, 80) || 'ENRJI', gstin: str(b.store?.gstin, 15).toUpperCase(), address: str(b.store?.address, 300), state: str(b.store?.state, 60), email: str(b.store?.email, 120), phone: str(b.store?.phone, 20) },
  };
  if (![0, 5, 12, 18, 28].includes(next.gst.rateUpTo) || ![0, 5, 12, 18, 28].includes(next.gst.rateAbove)) throw new StoreError('GST rates must be 0, 5, 12, 18 or 28%.');
  if (next.store.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(next.store.gstin)) throw new StoreError('That GSTIN doesn’t look right (15 characters, e.g. 24ABCDE1234F1Z5).');
  for (const [key, value] of Object.entries(next)) {
    await db().insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  }
  await audit(adminId, 'settings.save', 'settings', null, next);
  return next;
}

// ---------- Reports ----------
/** Sales, top products, payment split and GST for a date range (IST days, inclusive). */
export async function report(fromDay: string, toDay: string) {
  const from = sql`(${fromDay}::date)::timestamp at time zone 'Asia/Kolkata'`;
  const to = sql`((${toDay}::date + 1)::timestamp) at time zone 'Asia/Kolkata'`;
  const inRange = and(SOLD, gte(schema.orders.placedAt, from), lt(schema.orders.placedAt, to));
  const settings = await getSettings();
  const [summary, byDay, byPay, top, gstRows] = await Promise.all([
    db().select({
      orders: sql<number>`count(*)::int`, subtotal: sql<number>`coalesce(sum(${schema.orders.subtotal}),0)::int`,
      offer: sql<number>`coalesce(sum(${schema.orders.offerDiscount}),0)::int`, coupon: sql<number>`coalesce(sum(${schema.orders.couponDiscount}),0)::int`,
      shipping: sql<number>`coalesce(sum(${schema.orders.shipping}),0)::int`, cod: sql<number>`coalesce(sum(${schema.orders.codFee}),0)::int`,
      total: sql<number>`coalesce(sum(${schema.orders.total}),0)::int`, tax: sql<number>`coalesce(sum(${schema.orders.taxIncluded}),0)::int`,
    }).from(schema.orders).where(inRange),
    db().select({ day: sql<string>`to_char(${schema.orders.placedAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`, orders: sql<number>`count(*)::int`, total: sql<number>`sum(${schema.orders.total})::int` })
      .from(schema.orders).where(inRange).groupBy(sql`1`).orderBy(sql`1`),
    db().select({ method: schema.orders.paymentMethod, orders: sql<number>`count(*)::int`, total: sql<number>`sum(${schema.orders.total})::int` }).from(schema.orders).where(inRange).groupBy(schema.orders.paymentMethod),
    db().select({ title: schema.orderItems.title, qty: sql<number>`sum(${schema.orderItems.quantity})::int`, revenue: sql<number>`sum(${schema.orderItems.unitPrice} * ${schema.orderItems.quantity} - ${schema.orderItems.discount})::int` })
      .from(schema.orderItems).innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId)).where(inRange)
      .groupBy(schema.orderItems.title).orderBy(sql`2 desc`).limit(20),
    db().select({ rate: schema.orderItems.gstRate, hsn: schema.orderItems.hsn, state: sql<string>`${schema.orders.address}->>'state'`,
      value: sql<number>`sum(${schema.orderItems.unitPrice} * ${schema.orderItems.quantity} - ${schema.orderItems.discount})::int` })
      .from(schema.orderItems).innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId)).where(inRange)
      .groupBy(schema.orderItems.gstRate, schema.orderItems.hsn, sql`3`),
  ]);
  // GST: prices include tax. Taxable value = value × 100 / (100 + rate). Same state as the store: CGST + SGST; otherwise IGST.
  const gst = new Map<string, { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const r of gstRows) {
    const key = `${r.hsn}|${r.rate}`;
    const g = gst.get(key) ?? { hsn: r.hsn, rate: r.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    const taxable = Math.round((r.value * 100) / (100 + r.rate)), tax = r.value - taxable;
    g.taxable += taxable;
    if (r.state === settings.store.state) { g.cgst += Math.floor(tax / 2); g.sgst += tax - Math.floor(tax / 2); } else g.igst += tax;
    gst.set(key, g);
  }
  return { summary: summary[0], byDay, byPay, top, gst: [...gst.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate), storeState: settings.store.state };
}
