import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Razorpay over its REST API (no SDK). Set on Vercel: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (test keys
 * start rzp_test_), and RAZORPAY_WEBHOOK_SECRET for the webhook at /api/webhooks/razorpay.
 */
const KEY = process.env.RAZORPAY_KEY_ID ?? '';
const SECRET = process.env.RAZORPAY_KEY_SECRET ?? '';
export const razorpayEnabled = !!(KEY && SECRET);
export const razorpayKeyId = KEY;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Basic ${Buffer.from(`${KEY}:${SECRET}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay ${path}: ${j?.error?.description ?? res.status}`);
  return j as T;
}

export const createRazorpayOrder = (amount: number, receipt: string, notes: Record<string, string>) =>
  api<{ id: string; amount: number; status: string }>('/orders', { amount, currency: 'INR', receipt, notes });

export const refundPayment = (paymentId: string, amount: number) =>
  api<{ id: string; status: string }>(`/payments/${paymentId}/refund`, { amount, speed: 'normal' });

const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Checkout handler: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export const validPaymentSignature = (orderId: string, paymentId: string, signature: string) =>
  razorpayEnabled && eq(createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex'), signature);

/** Webhook: signature = HMAC_SHA256(raw body, webhook secret). */
export function validWebhookSignature(raw: string, signature: string) {
  const s = process.env.RAZORPAY_WEBHOOK_SECRET;
  return !!s && eq(createHmac('sha256', s).update(raw).digest('hex'), signature);
}
