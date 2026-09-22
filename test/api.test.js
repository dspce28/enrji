import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { openDb, seed } from '../server/db.js';
import { createApp } from '../server/app.js';
import { expireStaleOrders } from '../server/orders.js';
import { luhnValid } from '../server/payments.js';

const WEBHOOK_SECRET = 'whsec_test';
let server, base, db;
const stripeCalls = [];

// Stand-in for the Stripe REST client so tests never hit the network.
const fakeStripe = {
  async createCheckout(order) {
    stripeCalls.push(['create', order.id]);
    return { id: `cs_test_${order.id}`, url: `https://checkout.stripe.test/${order.id}` };
  },
  async getSession(id) {
    const orderId = Number(id.split('_').pop());
    const o = db.prepare('SELECT total_cents FROM orders WHERE id = ?').get(orderId);
    return { id, payment_status: 'paid', payment_intent: `pi_${orderId}`, amount_total: o.total_cents };
  },
  async refund(pi) { stripeCalls.push(['refund', pi]); return { id: `re_${pi}` }; },
};

before(async () => {
  db = openDb(':memory:');
  seed(db, { adminEmail: 'admin@test.local', adminPassword: 'adminpass1' });
  const app = createApp({ db, stripe: fakeStripe, demoPayments: true, baseUrl: 'http://localhost', stripeWebhookSecret: WEBHOOK_SECRET });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

/** Minimal cookie-aware client. */
function client() {
  let cookie = '';
  return async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

const address = { line1: '1 Neon Way', city: 'Night City', postal: '90210', country: 'US' };
const stockOf = (id) => db.prepare('SELECT stock FROM variants WHERE id = ?').get(id).stock;
const variantWithStock = (min) => db.prepare('SELECT * FROM variants WHERE stock >= ? ORDER BY id LIMIT 1').get(min);

test('catalog lists seeded products with variants', async () => {
  const c = client();
  const { status, body } = await c('/products');
  assert.equal(status, 200);
  assert.equal(body.products.length, 12);
  const one = await c(`/products/${body.products[0].slug}`);
  assert.equal(one.body.product.variants.length, one.body.product.colors.length * 6);
});

test('quote uses server prices and flags stock problems', async () => {
  const c = client();
  const v = variantWithStock(2);
  const { body } = await c('/cart/quote', { method: 'POST', body: { items: [{ variantId: v.id, quantity: 1, price: 1 }] } });
  const price = db.prepare('SELECT price_cents FROM products WHERE id = ?').get(v.product_id).price_cents;
  assert.equal(body.subtotal_cents, price);
  assert.equal(body.tax_cents, Math.round(price * 0.08));
  const over = await c('/cart/quote', { method: 'POST', body: { items: [{ variantId: v.id, quantity: v.stock + 1 }] } });
  assert.equal(over.body.problems.length, 1);
});

test('mutating API calls require JSON (CSRF guard)', async () => {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a' });
  assert.equal(res.status, 415);
});

test('demo checkout: reserve stock, decline, pay, fulfil', async () => {
  const c = client();
  const v = variantWithStock(3);
  const before = stockOf(v.id);
  const co = await c('/checkout', { method: 'POST', body: { items: [{ variantId: v.id, quantity: 2 }], email: 'guest@x.io', name: 'Guest', address, provider: 'demo' } });
  assert.equal(co.status, 201);
  assert.equal(co.body.order.status, 'pending_payment');
  assert.equal(co.body.order.access_token, undefined, 'token must not be in order body');
  assert.equal(stockOf(v.id), before - 2);
  const { id } = co.body.order;
  const token = co.body.token;

  // Without the token a stranger can't see it.
  assert.equal((await client()(`/orders/${id}`)).status, 404);

  const declined = await c(`/orders/${id}/pay/demo`, { method: 'POST', body: { token, card: { cardNumber: '4000 0000 0000 0002', expiry: '12/40', cvc: '123' } } });
  assert.equal(declined.status, 402);
  const bad = await c(`/orders/${id}/pay/demo`, { method: 'POST', body: { token, card: { cardNumber: '4242 4242 4242 4241', expiry: '12/40', cvc: '123' } } });
  assert.equal(bad.status, 402);
  const paid = await c(`/orders/${id}/pay/demo`, { method: 'POST', body: { token, card: { cardNumber: '4242 4242 4242 4242', expiry: '12/40', cvc: '123' } } });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.order.status, 'paid');
  const again = await c(`/orders/${id}/pay/demo`, { method: 'POST', body: { token, card: { cardNumber: '4242424242424242', expiry: '12/40', cvc: '123' } } });
  assert.equal(again.status, 409, 'cannot pay twice');

  const admin = client();
  await admin('/auth/login', { method: 'POST', body: { email: 'admin@test.local', password: 'adminpass1' } });
  assert.equal((await admin(`/admin/orders/${id}/status`, { method: 'POST', body: { status: 'delivered' } })).status, 409, 'illegal jump');
  for (const status of ['processing', 'shipped', 'delivered']) {
    const r = await admin(`/admin/orders/${id}/status`, { method: 'POST', body: { status, trackingNumber: 'TRK123' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.order.status, status);
  }
  const final = await c(`/orders/${id}?t=${token}`);
  assert.equal(final.body.order.tracking_number, 'TRK123');
  assert.equal(final.body.order.events.length, 5);
  assert.equal(stockOf(v.id), before - 2, 'delivered goods are not restocked');
});

test('cancelling an unpaid order releases stock; refunding a paid one restocks and refunds', async () => {
  const c = client();
  const v = variantWithStock(2);
  const start = stockOf(v.id);
  const a = await c('/checkout', { method: 'POST', body: { items: [{ variantId: v.id, quantity: 1 }], email: 'a@x.io', name: 'A', address, provider: 'demo' } });
  const cancel = await c(`/orders/${a.body.order.id}/cancel`, { method: 'POST', body: { token: a.body.token } });
  assert.equal(cancel.body.order.status, 'cancelled');
  assert.equal(stockOf(v.id), start);

  const b = await c('/checkout', { method: 'POST', body: { items: [{ variantId: v.id, quantity: 1 }], email: 'a@x.io', name: 'A', address, provider: 'demo' } });
  await c(`/orders/${b.body.order.id}/pay/demo`, { method: 'POST', body: { token: b.body.token, card: { cardNumber: '4242424242424242', expiry: '01/39', cvc: '999' } } });
  const refund = await c(`/orders/${b.body.order.id}/cancel`, { method: 'POST', body: { token: b.body.token } });
  assert.equal(refund.body.order.status, 'refunded');
  assert.equal(refund.body.order.payments[0].status, 'refunded');
  assert.equal(stockOf(v.id), start);
});

test('cannot oversell the last unit', async () => {
  const c = client();
  const v = variantWithStock(1);
  db.prepare('UPDATE variants SET stock = 1 WHERE id = ?').run(v.id);
  const body = { items: [{ variantId: v.id, quantity: 1 }], email: 'r@x.io', name: 'R', address, provider: 'demo' };
  const [x, y] = await Promise.all([c('/checkout', { method: 'POST', body }), c('/checkout', { method: 'POST', body })]);
  assert.deepEqual([x.status, y.status].sort(), [201, 409]);
  assert.equal(stockOf(v.id), 0);
});

test('stale unpaid orders expire and release stock', async () => {
  const c = client();
  const v = variantWithStock(1);
  const start = stockOf(v.id);
  const o = await c('/checkout', { method: 'POST', body: { items: [{ variantId: v.id, quantity: 1 }], email: 's@x.io', name: 'S', address, provider: 'demo' } });
  db.prepare("UPDATE orders SET created_at = datetime('now', '-45 minutes') WHERE id = ?").run(o.body.order.id);
  assert.ok(expireStaleOrders(db) >= 1);
  assert.equal(db.prepare('SELECT status FROM orders WHERE id = ?').get(o.body.order.id).status, 'cancelled');
  assert.equal(stockOf(v.id), start);
});

test('stripe checkout: redirect, signed webhook marks paid once, refund goes to Stripe', async () => {
  const c = client();
  const v = variantWithStock(1);
  const co = await c('/checkout', { method: 'POST', body: { items: [{ variantId: v.id, quantity: 1 }], email: 'st@x.io', name: 'St', address, provider: 'stripe' } });
  assert.equal(co.status, 201);
  assert.match(co.body.redirectUrl, /checkout\.stripe\.test/);
  const id = co.body.order.id;
  const total = co.body.order.total_cents;

  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: `cs_test_${id}`, payment_status: 'paid', payment_intent: `pi_${id}`, amount_total: total, metadata: { order_id: String(id) } } } });
  const forged = await fetch(`${base}/payments/stripe/webhook`, { method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=00' }, body: payload });
  assert.equal(forged.status, 400);

  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex');
  for (let i = 0; i < 2; i++) {
    const res = await fetch(`${base}/payments/stripe/webhook`, { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${sig}`, 'Content-Type': 'application/json' }, body: payload });
    assert.equal(res.status, 200);
  }
  const o = await c(`/orders/${id}?t=${co.body.token}`);
  assert.equal(o.body.order.status, 'paid');
  assert.equal(o.body.order.payments.filter((p) => p.status === 'succeeded').length, 1, 'webhook is idempotent');

  // The return-from-Stripe confirmation is also idempotent.
  const confirm = await c(`/orders/${id}/pay/stripe/confirm`, { method: 'POST', body: { token: co.body.token, sessionId: `cs_test_${id}` } });
  assert.equal(confirm.body.order.payments.filter((p) => p.status === 'succeeded').length, 1);

  const admin = client();
  await admin('/auth/login', { method: 'POST', body: { email: 'admin@test.local', password: 'adminpass1' } });
  const r = await admin(`/admin/orders/${id}/status`, { method: 'POST', body: { status: 'refunded' } });
  assert.equal(r.body.order.status, 'refunded');
  assert.deepEqual(stripeCalls.at(-1), ['refund', `pi_${id}`]);
});

test('auth: register, wrong password, admin gate', async () => {
  const c = client();
  const reg = await c('/auth/register', { method: 'POST', body: { email: 'New@X.io', name: 'Neo', password: 'short' } });
  assert.equal(reg.status, 400);
  const ok = await c('/auth/register', { method: 'POST', body: { email: 'New@X.io', name: 'Neo', password: 'longenough' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.email, 'new@x.io');
  assert.equal((await c('/auth/me')).body.user.email, 'new@x.io');
  assert.equal((await c('/admin/stats')).status, 403);
  assert.equal((await c('/orders')).status, 200);
  const wrong = await client()('/auth/login', { method: 'POST', body: { email: 'new@x.io', password: 'nope-nope' } });
  assert.equal(wrong.status, 401);
  await c('/auth/logout', { method: 'POST', body: {} });
  assert.equal((await c('/auth/me')).body.user, null);
});

test('admin: create product, adjust inventory, movement log', async () => {
  const admin = client();
  await admin('/auth/login', { method: 'POST', body: { email: 'admin@test.local', password: 'adminpass1' } });
  const bad = await admin('/admin/products', { method: 'POST', body: { name: 'X', price_cents: 3000, design: { type: 'nope', accent: '#000000', accent2: '#ffffff' }, colors: ['void-black'] } });
  assert.equal(bad.status, 400);
  const made = await admin('/admin/products', { method: 'POST', body: { name: 'Quantum', price_cents: 3900, design: { type: 'hex', accent: '#00ff00', accent2: '#ff00ff', text: '' }, colors: ['void-black', 'graphite'], initial_stock: 4 } });
  assert.equal(made.status, 201);
  const inv = await admin('/admin/inventory?q=QUANTUM');
  assert.equal(inv.body.variants.length, 12);
  const vid = inv.body.variants[0].id;
  assert.equal((await admin(`/admin/inventory/${vid}/adjust`, { method: 'POST', body: { reason: 'restock', delta: 6 } })).body.variant.stock, 10);
  assert.equal((await admin(`/admin/inventory/${vid}/adjust`, { method: 'POST', body: { reason: 'damaged', delta: -20 } })).status, 400);
  assert.equal((await admin(`/admin/inventory/${vid}/adjust`, { method: 'POST', body: { reason: 'count', set: 7 } })).body.variant.stock, 7);
  const log = await admin(`/admin/inventory/movements?variant=${vid}`);
  assert.deepEqual(log.body.movements.map((m) => m.delta), [-3, 6, 4]);
  const stats = await admin('/admin/stats');
  assert.ok(stats.body.revenue_cents > 0);
});

test('luhn', () => {
  assert.ok(luhnValid('4242424242424242'));
  assert.ok(!luhnValid('4242424242424241'));
});
