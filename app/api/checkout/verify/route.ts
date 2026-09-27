import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { body, requireUser, route, str, StoreError } from '@/lib/store/api';
import { markPaid } from '@/lib/store/orders';
import { validPaymentSignature } from '@/lib/store/razorpay';

/** POST { number, razorpay_order_id, razorpay_payment_id, razorpay_signature } from Razorpay Checkout. */
export const POST = route(async (req) => {
  const u = await requireUser();
  const b = await body(req);
  const number = str(b.number, 30), orderId = str(b.razorpay_order_id, 60), paymentId = str(b.razorpay_payment_id, 60), sig = str(b.razorpay_signature, 200);
  const [o] = await db().select().from(schema.orders).where(and(eq(schema.orders.number, number), eq(schema.orders.userId, u.id)));
  if (!o || o.razorpayOrderId !== orderId) throw new StoreError('Order not found.', 404);
  if (!validPaymentSignature(orderId, paymentId, sig)) throw new StoreError('We couldn’t confirm that payment. If money was taken, it will be matched automatically or refunded.', 400);
  const paid = await markPaid({ razorpayOrderId: orderId }, paymentId, { source: 'checkout', paymentId });
  return { ok: true, number: paid.number, status: paid.status };
});
