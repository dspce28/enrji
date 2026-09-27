import 'server-only';
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '../db';
import type { OrderStatus } from '../db/schema';
import { StoreError } from './api';
import { audit } from './admin';
import { cancelOrder } from './orders';

/** The delivery steps staff move an order through, and what each needs. */
export const NEXT_STEP: Partial<Record<OrderStatus, { action: string; to: OrderStatus; label: string }>> = {
  placed: { action: 'confirm', to: 'confirmed', label: 'Confirm order' },
  confirmed: { action: 'pack', to: 'packed', label: 'Mark packed' },
  packed: { action: 'ship', to: 'shipped', label: 'Mark shipped' },
  shipped: { action: 'out_for_delivery', to: 'out_for_delivery', label: 'Out for delivery' },
  out_for_delivery: { action: 'deliver', to: 'delivered', label: 'Mark delivered' },
};

export interface OrderFilter { status?: string; q?: string; payment?: string; refund?: boolean; page?: number }
const PAGE = 50;

function where(f: OrderFilter): SQL | undefined {
  const c: SQL[] = [];
  if (f.status === 'shipped') c.push(inArray(schema.orders.status, ['shipped', 'out_for_delivery']));
  else if (f.status) c.push(eq(schema.orders.status, f.status as OrderStatus));
  if (f.payment) c.push(eq(schema.orders.paymentMethod, f.payment as 'cod'));
  if (f.refund) c.push(and(eq(schema.orders.status, 'cancelled'), eq(schema.orders.paymentStatus, 'paid'))!);
  if (f.q) {
    const q = `%${f.q.trim()}%`;
    c.push(or(ilike(schema.orders.number, q), sql`${schema.orders.address}->>'name' ilike ${q}`, sql`${schema.orders.address}->>'phone' ilike ${q}`, ilike(schema.orders.awb, q))!);
  }
  return c.length ? and(...c) : undefined;
}

export async function listOrders(f: OrderFilter) {
  const page = Math.max(1, f.page ?? 1);
  const w = where(f);
  const [rows, [{ n }]] = await Promise.all([
    db().select().from(schema.orders).where(w).orderBy(desc(schema.orders.createdAt)).limit(PAGE).offset((page - 1) * PAGE),
    db().select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(w),
  ]);
  const items = rows.length ? await db().select({ orderId: schema.orderItems.orderId, q: schema.orderItems.quantity }).from(schema.orderItems).where(inArray(schema.orderItems.orderId, rows.map((r) => r.id))) : [];
  return { rows: rows.map((r) => ({ ...r, pieces: items.filter((i) => i.orderId === r.id).reduce((s, i) => s + i.q, 0) })), total: n, page, pages: Math.max(1, Math.ceil(n / PAGE)) };
}

export async function exportOrders(f: OrderFilter) {
  const rows = await db().select().from(schema.orders).where(where(f)).orderBy(desc(schema.orders.createdAt)).limit(10000);
  const items = rows.length ? await db().select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, rows.map((r) => r.id))) : [];
  const head = ['Order', 'Date', 'Status', 'Payment method', 'Payment status', 'Customer', 'Phone', 'City', 'State', 'Pincode', 'Items', 'Subtotal', 'Offer', 'Coupon', 'Coupon code', 'Shipping', 'COD fee', 'Total', 'GST included', 'Courier', 'AWB'];
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const r = (p: number) => (p / 100).toFixed(2);
  const lines = rows.map((o) => [
    o.number, o.createdAt.toISOString(), o.status, o.paymentMethod, o.paymentStatus, o.address.name, o.address.phone, o.address.city, o.address.state, o.address.pincode,
    items.filter((i) => i.orderId === o.id).map((i) => `${i.title} ${[i.color, i.size].filter(Boolean).join('/')} ×${i.quantity}`).join('; '),
    r(o.subtotal), r(o.offerDiscount), r(o.couponDiscount), o.couponCode, r(o.shipping), r(o.codFee), r(o.total), r(o.taxIncluded), o.courier, o.awb,
  ].map(esc).join(','));
  return [head.join(','), ...lines].join('\n');
}

export async function adminOrder(number: string) {
  const [o] = await db().select().from(schema.orders).where(eq(schema.orders.number, number));
  if (!o) return null;
  const [items, events, customer, returns] = await Promise.all([
    db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id)),
    db().select({ e: schema.orderEvents, by: schema.users.name }).from(schema.orderEvents).leftJoin(schema.users, eq(schema.users.id, schema.orderEvents.byUser))
      .where(eq(schema.orderEvents.orderId, o.id)).orderBy(schema.orderEvents.at),
    db().select().from(schema.users).where(eq(schema.users.id, o.userId)).then((r) => r[0]),
    db().select().from(schema.returns).where(eq(schema.returns.orderId, o.id)),
  ]);
  const [{ n: customerOrders }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(eq(schema.orders.userId, o.userId));
  return { ...o, items, events, customer, customerOrders, returns };
}

type Action =
  | { action: 'confirm' | 'pack' | 'out_for_delivery' | 'deliver' }
  | { action: 'ship'; courier: string; awb: string; trackingUrl?: string }
  | { action: 'tracking'; courier: string; awb: string; trackingUrl?: string }
  | { action: 'cancel'; reason: string }
  | { action: 'refund_done'; reference: string }
  | { action: 'note'; note: string };

/** Apply a staff action to an order. */
export async function orderAction(number: string, a: Action, staffId: string) {
  if (a.action === 'cancel') {
    if (a.reason.trim().length < 3) throw new StoreError('Please give a reason for cancelling.');
    const o = await cancelOrder(number, { staffId, reason: `Staff: ${a.reason.trim()}` });
    await audit(staffId, 'order.cancel', 'order', number, { reason: a.reason });
    return o;
  }
  return db().transaction(async (tx) => {
    const [o] = await tx.select().from(schema.orders).where(eq(schema.orders.number, number)).for('update');
    if (!o) throw new StoreError('Order not found.', 404);
    const ev = (status: string, note?: string) => tx.insert(schema.orderEvents).values({ orderId: o.id, status, note, byUser: staffId });

    if (a.action === 'note') {
      if (!a.note.trim()) throw new StoreError('Write a note first.');
      await ev('note', a.note.trim().slice(0, 500));
      return o;
    }
    if (a.action === 'refund_done') {
      if (!(o.status === 'cancelled' && o.paymentStatus === 'paid')) throw new StoreError('This order has no refund due.');
      await tx.update(schema.orders).set({ paymentStatus: 'refunded', updatedAt: new Date() }).where(eq(schema.orders.id, o.id));
      await ev('refunded', `Refunded by hand${a.reference ? ` (ref ${a.reference.trim().slice(0, 80)})` : ''}`);
      await audit(staffId, 'order.refund_done', 'order', number, { reference: a.reference });
      return o;
    }
    if (a.action === 'tracking') {
      if (!['shipped', 'out_for_delivery', 'delivered'].includes(o.status)) throw new StoreError('Add tracking when marking the order shipped.');
      await tx.update(schema.orders).set({ courier: a.courier.trim(), awb: a.awb.trim(), trackingUrl: a.trackingUrl?.trim() || null, updatedAt: new Date() }).where(eq(schema.orders.id, o.id));
      await ev('note', `Tracking updated: ${a.courier} ${a.awb}`);
      return o;
    }
    const step = NEXT_STEP[o.status];
    if (!step || step.action !== a.action) throw new StoreError(`This order is “${o.status.replace(/_/g, ' ')}”; that step doesn’t apply.`);
    const patch: Partial<typeof schema.orders.$inferInsert> = { status: step.to, updatedAt: new Date() };
    let note: string | undefined;
    if (a.action === 'ship') {
      if (!a.courier.trim() || !a.awb.trim()) throw new StoreError('Courier and AWB / tracking number are needed to ship.');
      Object.assign(patch, { courier: a.courier.trim().slice(0, 60), awb: a.awb.trim().slice(0, 60), trackingUrl: a.trackingUrl?.trim().slice(0, 300) || null });
      note = `${a.courier.trim()} · AWB ${a.awb.trim()}`;
    }
    if (a.action === 'deliver' && o.paymentMethod === 'cod') { patch.paymentStatus = 'cod_collected'; note = 'Cash collected on delivery'; }
    await tx.update(schema.orders).set(patch).where(eq(schema.orders.id, o.id));
    await ev(step.to, note);
    await audit(staffId, `order.${a.action}`, 'order', number);
    return { ...o, ...patch };
  });
}
