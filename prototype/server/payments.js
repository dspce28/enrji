import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError, PRICING } from './orders.js';

/**
 * Two providers:
 *  - "stripe": real hosted Stripe Checkout, enabled when STRIPE_SECRET_KEY is set.
 *  - "demo":   an in-app simulated card processor for development. It never
 *              moves money and must not be enabled in production.
 */

// ---------- demo ----------
export function luhnValid(num) {
  const digits = String(num).replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

export const DEMO_DECLINE_CARD = '4000000000000002';

export function demoCharge({ cardNumber, expiry, cvc }, amountCents) {
  const digits = String(cardNumber ?? '').replace(/\D/g, '');
  if (!luhnValid(digits)) throw new HttpError(402, 'Card number is invalid');
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(expiry ?? '').trim());
  if (!m || +m[1] < 1 || +m[1] > 12) throw new HttpError(402, 'Expiry must be MM/YY');
  const endOfMonth = new Date(Date.UTC(2000 + +m[2], +m[1], 1));
  if (endOfMonth <= new Date()) throw new HttpError(402, 'Card has expired');
  if (!/^\d{3,4}$/.test(String(cvc ?? ''))) throw new HttpError(402, 'CVC is invalid');
  const last4 = digits.slice(-4);
  if (digits === DEMO_DECLINE_CARD) return { ok: false, detail: `card ••••${last4} declined` };
  return { ok: true, ref: `demo_${randomBytes(8).toString('hex')}`, detail: `card ••••${last4}`, amountCents };
}

// ---------- stripe ----------
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export function stripeClient(secretKey, fetchImpl = fetch) {
  async function call(method, path, body) {
    const res = await fetchImpl(`https://api.stripe.com/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body ? form(body).toString() : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new HttpError(502, `Stripe: ${json?.error?.message || res.status}`);
    return json;
  }

  return {
    async createCheckout(order, baseUrl) {
      const line_items = order.items.map((it) => ({
        quantity: it.quantity,
        price_data: {
          currency: PRICING.currency,
          unit_amount: it.unit_price_cents,
          product_data: { name: `${it.product_name} — ${it.color} / ${it.size}` },
        },
      }));
      if (order.shipping_cents) line_items.push({ quantity: 1, price_data: { currency: PRICING.currency, unit_amount: order.shipping_cents, product_data: { name: 'Shipping' } } });
      if (order.tax_cents) line_items.push({ quantity: 1, price_data: { currency: PRICING.currency, unit_amount: order.tax_cents, product_data: { name: 'Sales tax' } } });
      const back = `${baseUrl}/#/order/${order.id}?t=${order.access_token}`;
      return call('POST', '/checkout/sessions', {
        mode: 'payment',
        customer_email: order.email,
        client_reference_id: String(order.id),
        metadata: { order_id: String(order.id), order_number: order.number },
        // Stripe's minimum is 30 minutes; our reservation (60 min) always outlives it.
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        success_url: `${back}&stripe_session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${back}&cancelled=1`,
        line_items: Object.fromEntries(line_items.map((li, i) => [i, li])),
      });
    },
    getSession: (id) => call('GET', `/checkout/sessions/${encodeURIComponent(id)}`),
    refund: (paymentIntent) => call('POST', '/refunds', { payment_intent: paymentIntent }),
  };
}

/** Verify a Stripe-Signature header against the raw request body. */
export function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(String(header ?? '').split(',').map((p) => p.split('=')).filter((p) => p.length === 2));
  const sigs = String(header ?? '').split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => {
    const buf = Buffer.from(s, 'hex');
    return buf.length === expected.length && timingSafeEqual(buf, expected);
  });
}
