import 'server-only';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db, schema, type Tx } from '../db';
import type { AddressSnapshot, OrderStatus } from '../db/schema';
import { StoreError } from './api';
import { otpOnScreen } from './auth';
import { quote } from './pricing';
import { getSettings } from './settings';
import { createRazorpayOrder, razorpayEnabled, razorpayKeyId, refundPayment } from './razorpay';

/**
 * Orders: placing (stock locked and taken in one transaction), paying, cancelling, and releasing stock
 * held by online orders that were never paid.
 */

export const PAYMENT_WINDOW_MIN = 30;
/** Test payments (a simulated gateway) only while Razorpay isn't set up and the site is in staging. */
export const testPayments = !razorpayEnabled && otpOnScreen;

const touchCatalogue = () => { try { revalidateTag('catalogue', 'max'); } catch { /* outside a request */ } };

async function event(tx: Tx, orderId: number, status: string, note?: string, byUser?: string) {
  await tx.insert(schema.orderEvents).values({ orderId, status, note, byUser });
}

/** Give back the stock of an order that won't ship (cancelled or never paid). Once only. */
async function releaseStock(tx: Tx, orderId: number, reason: 'cancel' | 'expired') {
  const [o] = await tx.update(schema.orders).set({ stockReleased: true })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.stockReleased, false))).returning();
  if (!o) return;
  const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  for (const it of items) {
    await tx.update(schema.variants).set({ stock: sql`${schema.variants.stock} + ${it.quantity}` }).where(eq(schema.variants.id, it.variantId));
    await tx.insert(schema.inventoryMovements).values({ variantId: it.variantId, delta: it.quantity, reason, orderId, note: `Order ${o.number}` });
  }
  // The coupon can be used again.
  await tx.delete(schema.couponRedemptions).where(eq(schema.couponRedemptions.orderId, orderId));
}

/** Online orders not paid within the window: cancel them and put their stock back. */
export async function expireUnpaid() {
  const stale = await db().select({ id: schema.orders.id }).from(schema.orders)
    .where(and(eq(schema.orders.status, 'pending_payment'), lt(schema.orders.createdAt, sql`now() - make_interval(mins => ${PAYMENT_WINDOW_MIN})`)));
  for (const { id } of stale) {
    await db().transaction(async (tx) => {
      const [o] = await tx.update(schema.orders).set({ status: 'cancelled', paymentStatus: 'failed', cancelReason: 'Payment not completed', updatedAt: new Date() })
        .where(and(eq(schema.orders.id, id), eq(schema.orders.status, 'pending_payment'))).returning();
      if (!o) return;
      await releaseStock(tx, id, 'expired');
      await event(tx, id, 'cancelled', 'Payment not completed in time; stock released');
    });
  }
  if (stale.length) touchCatalogue();
}

export interface PlaceInput {
  userId: string;
  lines: { variantId: number; quantity: number }[];
  couponCode?: string | null;
  addressId: string;
  payment: 'online' | 'cod';
  email?: string | null;
  expectedTotal?: number;     // what the shopper saw; if prices changed meanwhile, ask them to review
}

export async function placeOrder(input: PlaceInput) {
  await expireUnpaid();
  const settings = await getSettings();
  const [addr] = await db().select().from(schema.addresses).where(and(eq(schema.addresses.id, input.addressId), eq(schema.addresses.userId, input.userId)));
  if (!addr) throw new StoreError('Please choose a delivery address.');
  if (input.payment === 'online' && !razorpayEnabled && !testPayments) throw new StoreError('Online payment isn’t available right now. Please choose cash on delivery.');

  const order = await db().transaction(async (tx) => {
    const q = await quote({ lines: input.lines, couponCode: input.couponCode, userId: input.userId, payment: input.payment === 'cod' ? 'cod' : 'online' }, { tx, lock: true, settings });
    if (!q.lines.length) throw new StoreError('Your bag is empty.');
    const bad = q.lines.filter((l) => l.problem);
    if (bad.length) throw new StoreError(`${bad[0].title} (${bad[0].size}) ${bad[0].problem === 'short' ? `has only ${bad[0].stock} left` : 'just sold out'}. Please update your bag.`, 409, { lines: bad.map((l) => ({ variantId: l.variantId, stock: l.stock })) });
    if (input.couponCode && !q.coupon && q.couponMessage && !/automatic offer/.test(q.couponMessage)) throw new StoreError(q.couponMessage);
    if (input.payment === 'cod' && !q.codAllowed) throw new StoreError('Cash on delivery isn’t available for this order. Please pay online.');
    if (input.expectedTotal != null && input.expectedTotal !== q.total) throw new StoreError('Prices changed since you opened checkout. Please review the new total.', 409, { reprice: true });

    for (const l of q.lines) {
      const [ok] = await tx.update(schema.variants).set({ stock: sql`${schema.variants.stock} - ${l.quantity}` })
        .where(and(eq(schema.variants.id, l.variantId), sql`${schema.variants.stock} >= ${l.quantity}`)).returning({ id: schema.variants.id });
      if (!ok) throw new StoreError(`${l.title} (${l.size}) just sold out. Please update your bag.`, 409);
    }
    const [{ n }] = await tx.execute<{ n: string }>(sql`select nextval('order_number_seq')::text as n`);
    const cod = input.payment === 'cod';
    const address: AddressSnapshot = { name: addr.name, phone: addr.phone, line1: addr.line1, line2: addr.line2, landmark: addr.landmark, city: addr.city, state: addr.state, pincode: addr.pincode };
    const [o] = await tx.insert(schema.orders).values({
      number: `ENR-${n}`, userId: input.userId,
      status: cod ? 'placed' : 'pending_payment', paymentMethod: cod ? 'cod' : razorpayEnabled ? 'razorpay' : 'test',
      paymentStatus: cod ? 'cod_pending' : 'pending',
      subtotal: q.subtotal, offerDiscount: q.offerDiscount, couponDiscount: q.coupon?.discount ?? 0, couponCode: q.coupon?.code ?? null,
      shipping: q.shipping, codFee: q.codFee, total: q.total, taxIncluded: q.taxIncluded, address, email: input.email ?? null,
      placedAt: cod ? new Date() : null,
    }).returning();
    await tx.insert(schema.orderItems).values(q.lines.map((l) => ({
      orderId: o.id, variantId: l.variantId, productId: l.productId, handle: l.handle, title: l.title, size: l.size, color: l.color,
      image: l.image, sku: l.sku, unitPrice: l.unitPrice, compareAt: l.compareAt, quantity: l.quantity, discount: l.discount, hsn: l.hsn, gstRate: l.gstRate,
    })));
    for (const l of q.lines) await tx.insert(schema.inventoryMovements).values({ variantId: l.variantId, delta: -l.quantity, reason: 'order', orderId: o.id, note: o.number });
    if (q.coupon) await tx.insert(schema.couponRedemptions).values({ couponId: q.coupon.id, orderId: o.id, userId: input.userId });
    await event(tx, o.id, o.status, cod ? 'Order placed, cash on delivery' : 'Waiting for payment');
    if (cod) await clearBought(tx, input.userId, o.id);
    return o;
  });
  touchCatalogue();
  return order;
}

/** Remove what was bought from the saved cart. */
async function clearBought(tx: Tx, userId: string, orderId: number) {
  const items = await tx.select({ v: schema.orderItems.variantId }).from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  if (items.length) await tx.delete(schema.cartItems).where(and(eq(schema.cartItems.userId, userId), inArray(schema.cartItems.variantId, items.map((i) => i.v))));
}

/** Start (or restart) paying for an online order: a Razorpay order, or the test gateway. */
export async function startPayment(orderNumber: string, userId: string) {
  const [o] = await db().select().from(schema.orders).where(and(eq(schema.orders.number, orderNumber), eq(schema.orders.userId, userId)));
  if (!o) throw new StoreError('Order not found.', 404);
  if (o.status !== 'pending_payment') throw new StoreError(o.paymentStatus === 'paid' ? 'This order is already paid.' : 'This order can’t be paid any more.');
  if (Date.now() - o.createdAt.getTime() > PAYMENT_WINDOW_MIN * 60_000) { await expireUnpaid(); throw new StoreError('The time to pay for this order ran out. Please order again.'); }
  if (!razorpayEnabled) {
    if (!testPayments) throw new StoreError('Online payment isn’t available right now.');
    return { mode: 'test' as const, number: o.number, amount: o.total };
  }
  let rzpId = o.razorpayOrderId;
  if (!rzpId) {
    const r = await createRazorpayOrder(o.total, o.number, { order: o.number });
    rzpId = r.id;
    await db().update(schema.orders).set({ razorpayOrderId: rzpId }).where(eq(schema.orders.id, o.id));
  }
  return { mode: 'razorpay' as const, number: o.number, amount: o.total, razorpayOrderId: rzpId, key: razorpayKeyId, prefill: { name: o.address.name, contact: o.address.phone, email: o.email ?? undefined } };
}

/** A payment succeeded (checkout handler, webhook or test gateway). Idempotent. */
export async function markPaid(by: { razorpayOrderId?: string; number?: string }, paymentId: string, raw: unknown, provider = 'razorpay') {
  return db().transaction(async (tx) => {
    const where = by.razorpayOrderId ? eq(schema.orders.razorpayOrderId, by.razorpayOrderId) : eq(schema.orders.number, by.number ?? '');
    const [o] = await tx.select().from(schema.orders).where(where).for('update');
    if (!o) throw new StoreError('Order not found.', 404);
    await tx.insert(schema.payments).values({ orderId: o.id, provider, providerId: paymentId, event: 'paid', amount: o.total, raw: raw as object }).onConflictDoNothing();
    if (o.paymentStatus === 'paid') return o;
    if (o.status === 'cancelled') {
      // Paid after it had already expired: keep the money on record for a refund by the team.
      await event(tx, o.id, 'cancelled', `Payment ${paymentId} arrived after the order expired: refund needed`);
      return o;
    }
    const [u] = await tx.update(schema.orders).set({ status: 'placed', paymentStatus: 'paid', razorpayPaymentId: paymentId, placedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.orders.id, o.id)).returning();
    await event(tx, o.id, 'placed', `Paid online (${paymentId})`);
    await clearBought(tx, o.userId, o.id);
    return u;
  });
}

export async function markFailed(razorpayOrderId: string, paymentId: string, raw: unknown) {
  const [o] = await db().select().from(schema.orders).where(eq(schema.orders.razorpayOrderId, razorpayOrderId));
  if (!o) return;
  await db().insert(schema.payments).values({ orderId: o.id, provider: 'razorpay', providerId: paymentId, event: 'failed', raw: raw as object }).onConflictDoNothing();
}

const CUSTOMER_CANCELLABLE: OrderStatus[] = ['pending_payment', 'placed', 'confirmed'];

/** Cancel an order (by the shopper before it's packed, or by staff), put stock back and refund. */
export async function cancelOrder(number: string, opts: { userId?: string; staffId?: string; reason: string }) {
  const result = await db().transaction(async (tx) => {
    const conds = [eq(schema.orders.number, number)];
    if (opts.userId) conds.push(eq(schema.orders.userId, opts.userId));
    const [o] = await tx.select().from(schema.orders).where(and(...conds)).for('update');
    if (!o) throw new StoreError('Order not found.', 404);
    if (o.status === 'cancelled') return { order: o, refund: null };
    const allowed = opts.staffId ? !['delivered', 'returned'].includes(o.status) : CUSTOMER_CANCELLABLE.includes(o.status);
    if (!allowed) throw new StoreError(opts.staffId ? 'Delivered orders are handled as returns.' : 'This order is already being packed, so it can’t be cancelled here. Please contact us.');
    const [u] = await tx.update(schema.orders).set({ status: 'cancelled', cancelReason: opts.reason, updatedAt: new Date() }).where(eq(schema.orders.id, o.id)).returning();
    await releaseStock(tx, o.id, 'cancel');
    await event(tx, o.id, 'cancelled', opts.reason, opts.staffId ?? opts.userId);
    return { order: u, refund: o.paymentStatus === 'paid' ? { paymentId: o.razorpayPaymentId, amount: o.total, method: o.paymentMethod } : null };
  });
  touchCatalogue();
  // Refund outside the transaction (network call).
  if (result.refund) {
    let note = 'Refund issued to the original payment method';
    let status: 'refunded' | 'paid' = 'refunded';
    try {
      if (result.refund.method === 'razorpay' && result.refund.paymentId) await refundPayment(result.refund.paymentId, result.refund.amount);
      else note = 'Test payment refunded';
    } catch (e) {
      status = 'paid';
      note = `Automatic refund failed (${(e as Error).message}); refund needed from the admin`;
    }
    await db().transaction(async (tx) => {
      await tx.update(schema.orders).set({ paymentStatus: status }).where(eq(schema.orders.id, result.order.id));
      await event(tx, result.order.id, status === 'refunded' ? 'refunded' : 'refund_pending', note);
    });
  }
  return result.order;
}

export async function ordersFor(userId: string) {
  await expireUnpaid();
  const list = await db().select().from(schema.orders).where(eq(schema.orders.userId, userId)).orderBy(desc(schema.orders.createdAt)).limit(100);
  const items = list.length ? await db().select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, list.map((o) => o.id))) : [];
  return list.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
}

export async function orderDetail(number: string, userId?: string) {
  await expireUnpaid();
  const conds = [eq(schema.orders.number, number)];
  if (userId) conds.push(eq(schema.orders.userId, userId));
  const [o] = await db().select().from(schema.orders).where(and(...conds));
  if (!o) return null;
  const [items, events] = await Promise.all([
    db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id)),
    db().select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, o.id)).orderBy(schema.orderEvents.at),
  ]);
  return { ...o, items, events, cancellable: CUSTOMER_CANCELLABLE.includes(o.status) };
}
