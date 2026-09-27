'use client';

import { post } from './client';

export type PayStart =
  | { mode: 'test'; number: string; amount: number }
  | { mode: 'razorpay'; number: string; amount: number; razorpayOrderId: string; key: string; prefill: { name?: string; contact?: string; email?: string } };

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open(): void; on(e: string, cb: (r: unknown) => void): void } } }

function loadScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Couldn’t load the payment window. Check your connection and try again.'));
    document.body.appendChild(s);
  });
}

/** Open Razorpay Checkout; confirm the payment with our server before calling onPaid. */
export async function openRazorpay(p: Extract<PayStart, { mode: 'razorpay' }>, cb: { onPaid(): void; onDismiss(): void }) {
  await loadScript();
  const rzp = new window.Razorpay!({
    key: p.key, amount: p.amount, currency: 'INR', name: 'ENRJI', description: `Order ${p.number}`, order_id: p.razorpayOrderId,
    prefill: p.prefill, theme: { color: '#1d1915' },
    handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
      try { await post('/api/checkout/verify', { number: p.number, ...r }); } catch { /* the webhook will confirm it */ }
      cb.onPaid();
    },
    modal: { ondismiss: cb.onDismiss },
  });
  rzp.open();
}
