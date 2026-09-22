import { randomBytes } from 'node:crypto';
import { tx } from './db.js';

export const PRICING = {
  currency: 'usd',
  freeShippingOverCents: 7500,
  flatShippingCents: 600,
  taxRate: 0.08,
  maxQtyPerLine: 10,
};

export const STATUSES = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

// Allowed manual/admin transitions. Payment-driven transitions go through markPaid.
const TRANSITIONS = {
  pending_payment: ['cancelled'],
  paid: ['processing', 'refunded'],
  processing: ['shipped', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

// Stock goes back on the shelf only if the goods never left the warehouse.
const RESTOCK_ON = new Set(['pending_payment', 'paid', 'processing']);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function quote(subtotalCents) {
  const shipping = subtotalCents === 0 || subtotalCents >= PRICING.freeShippingOverCents ? 0 : PRICING.flatShippingCents;
  const tax = Math.round(subtotalCents * PRICING.taxRate);
  return { subtotal_cents: subtotalCents, shipping_cents: shipping, tax_cents: tax, total_cents: subtotalCents + shipping + tax };
}

/**
 * Validate a client cart against live prices and stock. Prices from the client are ignored.
 * @param items [{ variantId, quantity }]
 */
export function priceCart(db, items) {
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'Cart is empty');
  if (items.length > 50) throw new HttpError(400, 'Too many cart lines');
  const q = db.prepare(`SELECT v.id, v.color, v.size, v.sku, v.stock, p.id AS product_id, p.name, p.slug, p.design, p.price_cents, p.active
                        FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`);
  const merged = new Map();
  for (const it of items) {
    const id = Number(it?.variantId), qty = Number(it?.quantity);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1) throw new HttpError(400, 'Invalid cart line');
    merged.set(id, (merged.get(id) || 0) + qty);
  }
  const lines = [];
  const problems = [];
  for (const [id, qty] of merged) {
    const v = q.get(id);
    if (!v || !v.active) { problems.push({ variantId: id, error: 'No longer available' }); continue; }
    if (qty > v.stock) problems.push({ variantId: id, error: v.stock ? `Only ${v.stock} left` : 'Sold out', available: v.stock });
    else if (qty > PRICING.maxQtyPerLine) problems.push({ variantId: id, error: `Max ${PRICING.maxQtyPerLine} per item` });
    lines.push({ ...v, quantity: qty, line_total_cents: v.price_cents * qty });
  }
  const subtotal = lines.reduce((s, l) => s + l.line_total_cents, 0);
  return { lines, problems, ...quote(subtotal) };
}

function orderNumber() {
  const d = new Date();
  return `NRJ-${d.getUTCFullYear().toString().slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function cleanAddress(a = {}) {
  const f = (k, max = 120) => String(a[k] ?? '').trim().slice(0, max);
  const addr = { line1: f('line1'), line2: f('line2'), city: f('city', 80), region: f('region', 80), postal: f('postal', 20), country: f('country', 2).toUpperCase() };
  for (const k of ['line1', 'city', 'postal', 'country']) if (!addr[k]) throw new HttpError(400, `Shipping ${k} is required`);
  if (!/^[A-Z]{2}$/.test(addr.country)) throw new HttpError(400, 'Country must be a 2-letter code');
  return addr;
}

/** Create an order and reserve stock atomically. */
export function createOrder(db, { items, email, name, address, userId, provider }) {
  email = String(email ?? '').trim().toLowerCase();
  name = String(name ?? '').trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'A valid email is required');
  if (!name) throw new HttpError(400, 'Name is required');
  const shipping = cleanAddress(address);

  return tx(db, () => {
    const cart = priceCart(db, items);
    if (cart.problems.length) throw Object.assign(new HttpError(409, 'Some items are unavailable'), { problems: cart.problems });

    const number = orderNumber();
    const accessToken = randomBytes(18).toString('base64url');
    const { lastInsertRowid: orderId } = db.prepare(`INSERT INTO orders
      (number, access_token, user_id, email, name, shipping_address, subtotal_cents, shipping_cents, tax_cents, total_cents, payment_provider)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(number, accessToken, userId ?? null, email, name, JSON.stringify(shipping),
      cart.subtotal_cents, cart.shipping_cents, cart.tax_cents, cart.total_cents, provider);

    const insItem = db.prepare(`INSERT INTO order_items (order_id, variant_id, product_id, product_name, design, color, size, sku, unit_price_cents, quantity)
                                VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const dec = db.prepare('UPDATE variants SET stock = stock - ? WHERE id = ? AND stock >= ?');
    const mov = db.prepare("INSERT INTO inventory_movements (variant_id, delta, reason, ref) VALUES (?,?,'sale',?)");
    for (const l of cart.lines) {
      // Conditional decrement guards against a concurrent order taking the last unit.
      if (dec.run(l.quantity, l.id, l.quantity).changes !== 1) throw new HttpError(409, `${l.name} (${l.size}) just sold out`);
      mov.run(l.id, -l.quantity, number);
      insItem.run(orderId, l.id, l.product_id, l.name, l.design, l.color, l.size, l.sku, l.price_cents, l.quantity);
    }
    addEvent(db, orderId, 'pending_payment', 'Order placed, stock reserved');
    return getOrder(db, orderId);
  });
}

export function addEvent(db, orderId, status, note) {
  db.prepare('INSERT INTO order_events (order_id, status, note) VALUES (?,?,?)').run(orderId, status, note ?? null);
}

export function getOrder(db, id) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) return null;
  o.shipping_address = JSON.parse(o.shipping_address);
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(id).map((i) => ({ ...i, design: JSON.parse(i.design) }));
  o.events = db.prepare('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id').all(id);
  o.payments = db.prepare('SELECT id, provider, provider_ref, amount_cents, status, detail, created_at FROM payments WHERE order_id = ? ORDER BY id').all(id);
  return o;
}

export function publicOrder(o) {
  if (!o) return o;
  const { access_token, ...rest } = o;
  return rest;
}

function restock(db, order, reason) {
  const inc = db.prepare('UPDATE variants SET stock = stock + ? WHERE id = ?');
  const mov = db.prepare('INSERT INTO inventory_movements (variant_id, delta, reason, ref) VALUES (?,?,?,?)');
  for (const it of db.prepare('SELECT variant_id, quantity FROM order_items WHERE order_id = ?').all(order.id)) {
    inc.run(it.quantity, it.variant_id);
    mov.run(it.variant_id, it.quantity, reason, order.number);
  }
}

function setStatus(db, order, status, note, extra = {}) {
  const sets = ['status = ?', "updated_at = datetime('now')"];
  const vals = [status];
  if (extra.tracking_number !== undefined) { sets.push('tracking_number = ?'); vals.push(extra.tracking_number); }
  db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).run(...vals, order.id);
  addEvent(db, order.id, status, note);
}

/** Idempotently record a successful payment. Returns the updated order. */
export function markPaid(db, orderId, { provider, providerRef, amountCents, detail }) {
  return tx(db, () => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!o) throw new HttpError(404, 'Order not found');
    const dup = db.prepare("SELECT 1 FROM payments WHERE provider = ? AND provider_ref = ? AND status = 'succeeded'").get(provider, providerRef);
    if (dup || o.status !== 'pending_payment') {
      if (!dup && o.status === 'cancelled') {
        // Payment landed after the reservation expired. Record it so staff can refund.
        db.prepare("INSERT INTO payments (order_id, provider, provider_ref, amount_cents, status, detail) VALUES (?,?,?,?, 'needs_refund', ?)")
          .run(o.id, provider, providerRef, amountCents, 'Paid after order was cancelled');
        addEvent(db, o.id, 'cancelled', 'Late payment received — refund required');
      }
      return getOrder(db, orderId);
    }
    if (amountCents !== o.total_cents) throw new HttpError(400, 'Payment amount mismatch');
    db.prepare("INSERT INTO payments (order_id, provider, provider_ref, amount_cents, status, detail) VALUES (?,?,?,?, 'succeeded', ?)")
      .run(o.id, provider, providerRef, amountCents, detail ?? null);
    setStatus(db, o, 'paid', `Payment received via ${provider}`);
    return getOrder(db, orderId);
  });
}

export function recordFailedPayment(db, orderId, { provider, providerRef, amountCents, detail }) {
  db.prepare("INSERT INTO payments (order_id, provider, provider_ref, amount_cents, status, detail) VALUES (?,?,?,?, 'failed', ?)")
    .run(orderId, provider, providerRef ?? null, amountCents, detail ?? null);
}

/**
 * Move an order to a new status, enforcing the state machine.
 * `refund` is an async callback run *before* the DB change when refunding.
 */
export async function transition(db, orderId, to, { note, trackingNumber, refund } = {}) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!o) throw new HttpError(404, 'Order not found');
  if (!STATUSES.includes(to)) throw new HttpError(400, 'Unknown status');
  if (!TRANSITIONS[o.status].includes(to)) throw new HttpError(409, `Cannot move order from ${o.status} to ${to}`);

  let refundRef = null;
  if (to === 'refunded' && refund) refundRef = await refund(o);

  return tx(db, () => {
    const cur = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (cur.status !== o.status) throw new HttpError(409, 'Order changed concurrently, retry');
    if ((to === 'cancelled' || to === 'refunded') && RESTOCK_ON.has(cur.status)) restock(db, cur, to === 'cancelled' ? 'release' : 'refund');
    if (to === 'refunded') {
      db.prepare("UPDATE payments SET status = 'refunded', detail = COALESCE(detail || ' · ', '') || ? WHERE order_id = ? AND status = 'succeeded'")
        .run(`refund ${refundRef ?? 'recorded'}`, cur.id);
    }
    const extra = to === 'shipped' ? { tracking_number: String(trackingNumber ?? '').trim().slice(0, 60) || null } : {};
    setStatus(db, cur, to, note || defaultNote(to, extra.tracking_number), extra);
    return getOrder(db, orderId);
  });
}

function defaultNote(status, tracking) {
  return {
    processing: 'Printing and packing',
    shipped: tracking ? `Shipped · tracking ${tracking}` : 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Order cancelled, stock released',
    refunded: 'Refund issued',
  }[status];
}

/** Cancel unpaid orders older than their reservation window and release stock. */
export function expireStaleOrders(db, { demoMinutes = 30, stripeMinutes = 60 } = {}) {
  const stale = db.prepare(`SELECT id FROM orders WHERE status = 'pending_payment' AND (
      (payment_provider = 'stripe' AND created_at < datetime('now', ?)) OR
      (payment_provider != 'stripe' AND created_at < datetime('now', ?)))`)
    .all(`-${stripeMinutes} minutes`, `-${demoMinutes} minutes`);
  for (const { id } of stale) {
    tx(db, () => {
      const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
      if (o.status !== 'pending_payment') return;
      restock(db, o, 'release');
      setStatus(db, o, 'cancelled', 'Payment window expired, stock released');
    });
  }
  return stale.length;
}
