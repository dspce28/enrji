import { body, requireUser, route, str } from '@/lib/store/api';
import { placeOrder, startPayment } from '@/lib/store/orders';

/** POST { lines, coupon?, addressId, payment, email?, expectedTotal } → { number, pay? }. */
export const POST = route(async (req) => {
  const u = await requireUser();
  const b = await body<{ lines?: { variantId: number; quantity: number }[]; coupon?: string; addressId?: string; payment?: string; email?: string; expectedTotal?: number }>(req);
  const o = await placeOrder({
    userId: u.id, lines: Array.isArray(b.lines) ? b.lines : [], couponCode: str(b.coupon, 40) || null,
    addressId: str(b.addressId, 60), payment: b.payment === 'cod' ? 'cod' : 'online',
    email: str(b.email, 120) || u.email, expectedTotal: typeof b.expectedTotal === 'number' ? b.expectedTotal : undefined,
  });
  return { number: o.number, pay: o.status === 'pending_payment' ? await startPayment(o.number, u.id) : null };
});
