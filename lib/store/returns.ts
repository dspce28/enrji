import 'server-only';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db, schema } from '../db';
import { StoreError } from './api';
import { audit } from './admin';
import { getSettings } from './settings';
import { refundPayment } from './razorpay';

/**
 * Returns and exchanges.
 *  requested → approved → picked_up → received → refunded | exchanged → (closed)
 *  requested → rejected
 * The shopper asks within the return window after delivery; staff approve, arrange pickup, receive the
 * piece (restocking it if it can be sold again), then refund (Razorpay for online payments, by hand for
 * COD) or send the other size as a free replacement order.
 */

export const RETURN_REASONS = ['Size doesn’t fit', 'Damaged or defective', 'Wrong item received', 'Didn’t like it', 'Other'];
export const RETURN_LABEL: Record<string, string> = {
  requested: 'Requested', approved: 'Approved, pickup being arranged', rejected: 'Not approved', picked_up: 'Picked up',
  received: 'Received at our warehouse', refunded: 'Refunded', exchanged: 'Exchange sent', closed: 'Closed',
};
const OPEN = ['requested', 'approved', 'picked_up', 'received'] as const;

async function deliveredAt(orderId: number) {
  const [e] = await db().select({ at: schema.orderEvents.at }).from(schema.orderEvents)
    .where(and(eq(schema.orderEvents.orderId, orderId), eq(schema.orderEvents.status, 'delivered'))).orderBy(desc(schema.orderEvents.at)).limit(1);
  return e?.at ?? null;
}

/** What the shopper can still return from an order (quantity per item), and until when. */
export async function returnable(number: string, userId: string) {
  const [o] = await db().select().from(schema.orders).where(and(eq(schema.orders.number, number), eq(schema.orders.userId, userId)));
  if (!o) return null;
  const settings = await getSettings();
  const at = o.status === 'delivered' ? await deliveredAt(o.id) : null;
  const until = at ? new Date(at.getTime() + settings.returns.windowDays * 86400_000) : null;
  const items = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
  const prior = await db().select().from(schema.returns).where(and(eq(schema.returns.orderId, o.id), ne(schema.returns.status, 'rejected')));
  const used = new Map<number, number>();
  for (const r of prior) for (const it of r.items) used.set(it.orderItemId, (used.get(it.orderItemId) ?? 0) + it.quantity);
  // Other sizes of the same product, for exchanges.
  const sizes = items.length ? await db().select().from(schema.variants).where(inArray(schema.variants.productId, items.map((i) => i.productId))) : [];
  return {
    order: o, until, open: !!until && until > new Date(), exchangeOnly: settings.returns.exchangeOnly, prior,
    items: items.map((i) => ({
      ...i, left: i.quantity - (used.get(i.id) ?? 0),
      swaps: sizes.filter((v) => v.productId === i.productId && v.id !== i.variantId && v.active && v.stock > 0 && v.color === i.color).map((v) => ({ id: v.id, size: v.size })),
    })),
  };
}

export async function requestReturn(number: string, userId: string, input: { type: 'return' | 'exchange'; reason: string; comments: string; items: { orderItemId: number; quantity: number; exchangeVariantId?: number }[] }) {
  const r = await returnable(number, userId);
  if (!r) throw new StoreError('Order not found.', 404);
  if (!r.open) throw new StoreError(r.until ? 'The return window for this order has closed.' : 'Returns open once the order is delivered.');
  if (!RETURN_REASONS.includes(input.reason)) throw new StoreError('Please choose a reason.');
  const faulty = /damaged|wrong item/i.test(input.reason);
  if (input.type === 'return' && r.exchangeOnly && !faulty) throw new StoreError('We offer size exchanges on this order. Choose exchange, or tell us if the piece is damaged or wrong.');
  const chosen = input.items.filter((i) => i.quantity > 0);
  if (!chosen.length) throw new StoreError('Choose at least one piece.');
  for (const c of chosen) {
    const it = r.items.find((i) => i.id === c.orderItemId);
    if (!it || c.quantity > it.left) throw new StoreError('One of those pieces can’t be returned (already requested?).');
    if (input.type === 'exchange' && !it.swaps.some((s) => s.id === c.exchangeVariantId)) throw new StoreError(`Please choose the new size for ${it.title}.`);
  }
  const [row] = await db().insert(schema.returns).values({
    orderId: r.order.id, userId, type: input.type, status: 'requested', reason: input.reason, comments: input.comments.slice(0, 1000) || null,
    items: chosen.map((c) => ({ orderItemId: c.orderItemId, quantity: c.quantity, ...(input.type === 'exchange' ? { exchangeVariantId: c.exchangeVariantId } : {}) })),
  }).returning();
  await db().insert(schema.orderEvents).values({ orderId: r.order.id, status: 'note', note: `${input.type === 'exchange' ? 'Exchange' : 'Return'} #${row.id} requested: ${input.reason}` });
  return row;
}

// ---------- Admin ----------
export async function listReturns(status?: string) {
  return db().select({ r: schema.returns, number: schema.orders.number, name: sql<string>`${schema.orders.address}->>'name'`, method: schema.orders.paymentMethod })
    .from(schema.returns).innerJoin(schema.orders, eq(schema.orders.id, schema.returns.orderId))
    .where(status === 'open' || !status ? inArray(schema.returns.status, [...OPEN]) : eq(schema.returns.status, status as 'requested'))
    .orderBy(desc(schema.returns.createdAt)).limit(200);
}

export async function returnDetail(id: number) {
  const [r] = await db().select().from(schema.returns).where(eq(schema.returns.id, id));
  if (!r) return null;
  const [o] = await db().select().from(schema.orders).where(eq(schema.orders.id, r.orderId));
  const items = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
  const swapIds = r.items.map((i) => i.exchangeVariantId).filter((x): x is number => !!x);
  const swaps = swapIds.length ? await db().select().from(schema.variants).where(inArray(schema.variants.id, swapIds)) : [];
  const lines = r.items.map((ri) => {
    const it = items.find((i) => i.id === ri.orderItemId)!;
    const value = Math.round(it.unitPrice * ri.quantity - (it.discount * ri.quantity) / it.quantity);
    return { ...ri, item: it, value, swap: swaps.find((v) => v.id === ri.exchangeVariantId) ?? null };
  });
  const [exchange] = r.exchangeOrderId ? await db().select({ number: schema.orders.number }).from(schema.orders).where(eq(schema.orders.id, r.exchangeOrderId)) : [];
  return { ...r, order: o, lines, suggestedRefund: lines.reduce((s, l) => s + l.value, 0), exchangeNumber: exchange?.number ?? null };
}

type Act = { action: 'approve' } | { action: 'reject'; note: string } | { action: 'picked_up' } | { action: 'receive'; restock: boolean }
  | { action: 'refund'; amount: number; reference: string } | { action: 'exchange' } | { action: 'note'; note: string };

const FLOW: Record<string, string[]> = { approve: ['requested'], reject: ['requested', 'approved'], picked_up: ['approved'], receive: ['approved', 'picked_up'], refund: ['received'], exchange: ['received'] };

export async function returnAction(id: number, a: Act, staffId: string) {
  const d = await returnDetail(id);
  if (!d) throw new StoreError('Return not found.', 404);
  const log = (note: string) => db().insert(schema.orderEvents).values({ orderId: d.orderId, status: 'note', note: `Return #${id}: ${note}`, byUser: staffId });
  if (a.action === 'note') {
    await db().update(schema.returns).set({ notes: [d.notes, a.note.trim()].filter(Boolean).join('\n'), updatedAt: new Date() }).where(eq(schema.returns.id, id));
    return;
  }
  if (!FLOW[a.action]?.includes(d.status)) throw new StoreError(`This return is “${d.status.replace(/_/g, ' ')}”; that step doesn’t apply.`);
  if (a.action === 'refund' && d.type !== 'return') throw new StoreError('This is an exchange; send the replacement instead.');
  if (a.action === 'exchange' && d.type !== 'exchange') throw new StoreError('This is a return; refund it instead.');

  if (a.action === 'approve' || a.action === 'picked_up') {
    await db().update(schema.returns).set({ status: a.action === 'approve' ? 'approved' : 'picked_up', updatedAt: new Date() }).where(eq(schema.returns.id, id));
    await log(a.action === 'approve' ? 'approved' : 'picked up');
  }
  if (a.action === 'reject') {
    if (!a.note.trim()) throw new StoreError('Tell the customer why.');
    await db().update(schema.returns).set({ status: 'rejected', notes: a.note.trim(), updatedAt: new Date() }).where(eq(schema.returns.id, id));
    await log(`not approved: ${a.note.trim()}`);
  }
  if (a.action === 'receive') {
    await db().transaction(async (tx) => {
      await tx.update(schema.returns).set({ status: 'received', restocked: a.restock, updatedAt: new Date() }).where(eq(schema.returns.id, id));
      if (a.restock) for (const l of d.lines) {
        await tx.update(schema.variants).set({ stock: sql`${schema.variants.stock} + ${l.quantity}` }).where(eq(schema.variants.id, l.item.variantId));
        await tx.insert(schema.inventoryMovements).values({ variantId: l.item.variantId, delta: l.quantity, reason: 'return', orderId: d.orderId, note: `Return #${id}`, byUser: staffId });
      }
    });
    await log(a.restock ? 'received and restocked' : 'received (not restocked)');
    try { revalidateTag('catalogue', { expire: 0 }); } catch { /* ignore */ }
  }
  if (a.action === 'refund') {
    const amount = Math.round(a.amount);
    if (!(amount > 0 && amount <= d.order.total)) throw new StoreError('Refund amount must be more than zero and no more than the order total.');
    let ref = a.reference.trim();
    if (d.order.paymentMethod === 'razorpay' && d.order.razorpayPaymentId && !ref) {
      const r = await refundPayment(d.order.razorpayPaymentId, amount).catch((e) => { throw new StoreError(`Razorpay refund failed: ${(e as Error).message}. Refund by hand and enter the reference.`); });
      ref = r.id;
    }
    if (!ref && d.order.paymentMethod !== 'test') throw new StoreError('Enter the refund reference (UPI / bank transfer id) for this COD order.');
    await db().transaction(async (tx) => {
      await tx.update(schema.returns).set({ status: 'refunded', refundAmount: amount, refundRef: ref || 'test', updatedAt: new Date() }).where(eq(schema.returns.id, id));
      const refunded = await tx.select({ s: sql<number>`coalesce(sum(${schema.returns.refundAmount}), 0)::int` }).from(schema.returns).where(and(eq(schema.returns.orderId, d.orderId), eq(schema.returns.status, 'refunded')));
      const full = refunded[0].s >= d.order.total - d.order.shipping - d.order.codFee;
      await tx.update(schema.orders).set({ paymentStatus: full ? 'refunded' : 'partially_refunded', ...(full ? { status: 'returned' as const } : {}), updatedAt: new Date() }).where(eq(schema.orders.id, d.orderId));
      await tx.insert(schema.orderEvents).values({ orderId: d.orderId, status: full ? 'returned' : 'refunded', note: `Refund ₹${(amount / 100).toFixed(2)} for return #${id}${ref ? ` (ref ${ref})` : ''}`, byUser: staffId });
    });
  }
  if (a.action === 'exchange') {
    await db().transaction(async (tx) => {
      // A free replacement order for the new sizes, taking them from stock.
      for (const l of d.lines) {
        const [ok] = await tx.update(schema.variants).set({ stock: sql`${schema.variants.stock} - ${l.quantity}` })
          .where(and(eq(schema.variants.id, l.exchangeVariantId!), sql`${schema.variants.stock} >= ${l.quantity}`)).returning({ id: schema.variants.id });
        if (!ok) throw new StoreError(`${l.item.title} in size ${l.swap?.size} is out of stock. Restock it or offer a refund.`);
      }
      const [{ n }] = await tx.execute<{ n: string }>(sql`select nextval('order_number_seq')::text as n`);
      const [x] = await tx.insert(schema.orders).values({
        number: `ENR-${n}`, userId: d.userId, status: 'confirmed', paymentMethod: 'exchange', paymentStatus: 'paid',
        subtotal: 0, total: 0, address: d.order.address, email: d.order.email, placedAt: new Date(),
      }).returning();
      await tx.insert(schema.orderItems).values(d.lines.map((l) => ({
        orderId: x.id, variantId: l.exchangeVariantId!, productId: l.item.productId, handle: l.item.handle, title: l.item.title,
        size: l.swap?.size ?? '', color: l.item.color, image: l.item.image, sku: l.swap?.sku ?? null, unitPrice: 0, quantity: l.quantity, hsn: l.item.hsn, gstRate: l.item.gstRate,
      })));
      for (const l of d.lines) await tx.insert(schema.inventoryMovements).values({ variantId: l.exchangeVariantId!, delta: -l.quantity, reason: 'order', orderId: x.id, note: `Exchange for ${d.order.number}`, byUser: staffId });
      await tx.insert(schema.orderEvents).values({ orderId: x.id, status: 'confirmed', note: `Replacement for ${d.order.number} (exchange #${id})`, byUser: staffId });
      await tx.update(schema.returns).set({ status: 'exchanged', exchangeOrderId: x.id, updatedAt: new Date() }).where(eq(schema.returns.id, id));
      await tx.insert(schema.orderEvents).values({ orderId: d.orderId, status: 'note', note: `Exchange #${id}: replacement ${x.number} created`, byUser: staffId });
    });
    try { revalidateTag('catalogue', { expire: 0 }); } catch { /* ignore */ }
  }
  await audit(staffId, `return.${a.action}`, 'return', id, a);
}
