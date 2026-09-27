import { body, requireUser, route, str } from '@/lib/store/api';
import { cancelOrder } from '@/lib/store/orders';

/** POST { reason } → the shopper cancels their own order (before it's packed). */
export const POST = route(async (req, { params }) => {
  const u = await requireUser();
  const reason = str((await body(req)).reason, 200) || 'Cancelled by customer';
  const o = await cancelOrder((await params).number, { userId: u.id, reason: `Customer: ${reason}` });
  return { ok: true, status: o.status };
});
