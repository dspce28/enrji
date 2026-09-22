import { Router } from 'express';
import { createSession, destroySession, hashPassword, verifyPassword, sessionCookie, requireUser, rateLimit } from '../auth.js';
import {
  HttpError, PRICING, priceCart, createOrder, getOrder, publicOrder, markPaid, recordFailedPayment, transition,
} from '../orders.js';
import { imagesFor } from '../db.js';
import { demoCharge, verifyStripeSignature, DEMO_DECLINE_CARD } from '../payments.js';

export function productRow(p, variants, images = {}) {
  const design = JSON.parse(p.design);
  const colors = [...new Set(variants.map((v) => v.color))];
  const totalStock = variants.reduce((s, v) => s + v.stock, 0);
  return { id: p.id, slug: p.slug, name: p.name, description: p.description, category: p.category, price_cents: p.price_cents,
    design, featured: !!p.featured, active: !!p.active, colors, total_stock: totalStock, images };
}

/** Refund the captured payment for an order through whichever provider took it. */
export function makeRefunder(cfg) {
  return async (order) => {
    const pay = cfg.db.prepare("SELECT * FROM payments WHERE order_id = ? AND status = 'succeeded' ORDER BY id DESC").get(order.id);
    if (!pay) return null;
    if (pay.provider === 'stripe') {
      if (!cfg.stripe) throw new HttpError(503, 'Stripe is not configured; cannot refund');
      const r = await cfg.stripe.refund(pay.provider_ref);
      return r.id;
    }
    return `demo_refund_${pay.id}`;
  };
}

export function storeRoutes(cfg) {
  const { db } = cfg;
  const r = Router();
  const providers = [...(cfg.stripe ? ['stripe'] : []), ...(cfg.demoPayments ? ['demo'] : [])];

  r.get('/config', (_req, res) => {
    res.json({ providers, pricing: PRICING, demoDeclineCard: cfg.demoPayments ? DEMO_DECLINE_CARD : undefined });
  });

  // ---------- catalog ----------
  const variantsFor = db.prepare('SELECT id, color, size, sku, stock FROM variants WHERE product_id = ? ORDER BY id');

  r.get('/products', (req, res) => {
    const where = ['active = 1'];
    const args = [];
    if (req.query.category) { where.push('category = ?'); args.push(String(req.query.category)); }
    if (req.query.q) { where.push('(name LIKE ? OR description LIKE ?)'); const q = `%${String(req.query.q).slice(0, 60)}%`; args.push(q, q); }
    if (req.query.featured) where.push('featured = 1');
    const order = { 'price-asc': 'price_cents ASC', 'price-desc': 'price_cents DESC', new: 'created_at DESC, id DESC' }[req.query.sort] || 'featured DESC, id ASC';
    const rows = db.prepare(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY ${order}`).all(...args);
    const categories = db.prepare('SELECT DISTINCT category FROM products WHERE active = 1 ORDER BY category').all().map((c) => c.category);
    res.json({ products: rows.map((p) => productRow(p, variantsFor.all(p.id), imagesFor(db, p.id))), categories });
  });

  r.get('/products/:slug', (req, res) => {
    const p = db.prepare('SELECT * FROM products WHERE slug = ? AND active = 1').get(req.params.slug);
    if (!p) throw new HttpError(404, 'Product not found');
    const variants = variantsFor.all(p.id);
    res.json({ product: { ...productRow(p, variants, imagesFor(db, p.id)), variants } });
  });

  r.post('/cart/quote', (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.json({ lines: [], problems: [], subtotal_cents: 0, shipping_cents: 0, tax_cents: 0, total_cents: 0 });
    const cart = priceCart(db, items);
    res.json({ ...cart, lines: cart.lines.map((l) => ({ ...l, design: JSON.parse(l.design) })) });
  });

  // ---------- auth ----------
  const authLimit = rateLimit({ windowMs: 10 * 60_000, max: 20 });
  const setCookie = (res, s) => res.setHeader('Set-Cookie', sessionCookie(s.token, s.expires, cfg.secureCookies));

  r.post('/auth/register', authLimit, (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const name = String(req.body?.name ?? '').trim().slice(0, 80);
    const password = String(req.body?.password ?? '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email');
    if (!name) throw new HttpError(400, 'Enter your name');
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'An account with that email already exists');
    const { lastInsertRowid } = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)').run(email, name, hashPassword(password));
    // Attach earlier guest orders placed with this email.
    db.prepare('UPDATE orders SET user_id = ? WHERE user_id IS NULL AND email = ?').run(lastInsertRowid, email);
    setCookie(res, createSession(db, lastInsertRowid));
    res.status(201).json({ user: { id: Number(lastInsertRowid), email, name, role: 'customer' } });
  });

  r.post('/auth/login', authLimit, (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!u || !verifyPassword(String(req.body?.password ?? ''), u.password_hash)) throw new HttpError(401, 'Wrong email or password');
    setCookie(res, createSession(db, u.id));
    res.json({ user: { id: u.id, email: u.email, name: u.name, role: u.role } });
  });

  r.post('/auth/logout', (req, res) => {
    destroySession(db, req.sessionToken);
    res.setHeader('Set-Cookie', sessionCookie('', null, cfg.secureCookies));
    res.json({ ok: true });
  });

  r.get('/auth/me', (req, res) => res.json({ user: req.user }));

  // ---------- checkout & orders ----------
  r.post('/checkout', async (req, res) => {
    const provider = String(req.body?.provider ?? '');
    if (!providers.includes(provider)) throw new HttpError(400, 'Payment method unavailable');
    const email = req.user?.email ?? req.body?.email;
    const order = createOrder(db, { items: req.body?.items, email, name: req.body?.name, address: req.body?.address, userId: req.user?.id, provider });
    const out = { order: publicOrder(order), token: order.access_token };
    if (provider === 'stripe') {
      try {
        const session = await cfg.stripe.createCheckout(order, cfg.baseUrl);
        db.prepare("INSERT INTO payments (order_id, provider, provider_ref, amount_cents, status, detail) VALUES (?, 'stripe', ?, ?, 'pending', 'checkout session')")
          .run(order.id, session.id, order.total_cents);
        out.redirectUrl = session.url;
      } catch (err) {
        await transition(db, order.id, 'cancelled', { note: 'Could not start payment' });
        throw err;
      }
    }
    res.status(201).json(out);
  });

  /** Owner, admin, or anyone holding the order's access token (guest checkout links). */
  function loadOrderFor(req) {
    const id = Number(req.params.id);
    const o = Number.isInteger(id) ? getOrder(db, id) : null;
    if (!o) throw new HttpError(404, 'Order not found');
    const token = String(req.query.t ?? req.body?.token ?? '');
    const ok = req.user?.role === 'admin' || (req.user && o.user_id === req.user.id) || (token && token === o.access_token);
    if (!ok) throw new HttpError(404, 'Order not found');
    return o;
  }

  r.get('/orders', requireUser, (req, res) => {
    const rows = db.prepare('SELECT id FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
    res.json({ orders: rows.map((r) => publicOrder(getOrder(db, r.id))) });
  });

  r.get('/orders/:id', (req, res) => res.json({ order: publicOrder(loadOrderFor(req)) }));

  r.post('/orders/:id/pay/demo', rateLimit({ windowMs: 60_000, max: 15 }), (req, res) => {
    if (!cfg.demoPayments) throw new HttpError(400, 'Demo payments are disabled');
    const o = loadOrderFor(req);
    if (o.status !== 'pending_payment') throw new HttpError(409, 'This order is not awaiting payment');
    const result = demoCharge(req.body?.card ?? {}, o.total_cents);
    if (!result.ok) {
      recordFailedPayment(db, o.id, { provider: 'demo', amountCents: o.total_cents, detail: result.detail });
      throw new HttpError(402, 'Your card was declined');
    }
    const order = markPaid(db, o.id, { provider: 'demo', providerRef: result.ref, amountCents: o.total_cents, detail: result.detail });
    res.json({ order: publicOrder(order) });
  });

  // Called when the shopper returns from Stripe. Verifies with Stripe directly,
  // so payment works even where webhooks can't reach the server (local dev).
  r.post('/orders/:id/pay/stripe/confirm', async (req, res) => {
    if (!cfg.stripe) throw new HttpError(400, 'Stripe is not configured');
    const o = loadOrderFor(req);
    const sessionId = String(req.body?.sessionId ?? '');
    const known = db.prepare("SELECT 1 FROM payments WHERE order_id = ? AND provider = 'stripe' AND provider_ref = ?").get(o.id, sessionId);
    if (!known) throw new HttpError(400, 'Unknown payment session');
    const s = await cfg.stripe.getSession(sessionId);
    if (s.payment_status === 'paid') {
      db.prepare("UPDATE payments SET status = 'superseded' WHERE order_id = ? AND provider_ref = ? AND status = 'pending'").run(o.id, sessionId);
      markPaid(db, o.id, { provider: 'stripe', providerRef: s.payment_intent, amountCents: s.amount_total, detail: `checkout ${s.id}` });
    }
    res.json({ order: publicOrder(getOrder(db, o.id)), paid: s.payment_status === 'paid' });
  });

  r.post('/payments/stripe/webhook', (req, res) => {
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    if (!cfg.stripeWebhookSecret || !verifyStripeSignature(raw, req.get('stripe-signature'), cfg.stripeWebhookSecret)) {
      return res.status(400).json({ error: 'Bad signature' });
    }
    const event = JSON.parse(raw);
    const s = event.data?.object;
    const orderId = Number(s?.metadata?.order_id);
    if (event.type === 'checkout.session.completed' && s.payment_status === 'paid' && orderId) {
      db.prepare("UPDATE payments SET status = 'superseded' WHERE order_id = ? AND provider_ref = ? AND status = 'pending'").run(orderId, s.id);
      markPaid(db, orderId, { provider: 'stripe', providerRef: s.payment_intent, amountCents: s.amount_total, detail: `checkout ${s.id}` });
    } else if (event.type === 'checkout.session.expired' && orderId) {
      const o = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
      if (o?.status === 'pending_payment') transition(db, orderId, 'cancelled', { note: 'Checkout session expired' }).catch(() => {});
    }
    res.json({ received: true });
  });

  // Customers can cancel before production starts; a paid order is refunded.
  r.post('/orders/:id/cancel', async (req, res) => {
    const o = loadOrderFor(req);
    if (o.status === 'pending_payment') {
      return res.json({ order: publicOrder(await transition(db, o.id, 'cancelled', { note: 'Cancelled by customer' })) });
    }
    if (o.status === 'paid') {
      return res.json({ order: publicOrder(await transition(db, o.id, 'refunded', { note: 'Cancelled by customer, refunded', refund: makeRefunder(cfg) })) });
    }
    throw new HttpError(409, 'This order is already being packed and can no longer be cancelled online. Contact us to arrange a return.');
  });

  return r;
}
