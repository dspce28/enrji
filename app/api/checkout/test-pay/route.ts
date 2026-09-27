import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { body, requireUser, route, str, StoreError } from '@/lib/store/api';
import { markPaid, testPayments } from '@/lib/store/orders';

/** Staging only (no Razorpay keys): simulate the gateway's success or failure. */
export const POST = route(async (req) => {
  if (!testPayments) throw new StoreError('Not available.', 404);
  const u = await requireUser();
  const b = await body(req);
  const number = str(b.number, 30);
  const [o] = await db().select().from(schema.orders).where(and(eq(schema.orders.number, number), eq(schema.orders.userId, u.id)));
  if (!o || o.status !== 'pending_payment') throw new StoreError('Order not found or not awaiting payment.', 404);
  if (b.outcome !== 'success') return { ok: false, message: 'Payment failed (test). You can try again.' };
  await markPaid({ number }, `test_${Date.now()}`, { test: true }, 'test');
  return { ok: true };
});
