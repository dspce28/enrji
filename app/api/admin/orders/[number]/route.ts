import { body, route, str, StoreError } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';
import { orderAction } from '@/lib/store/adminOrders';

/** POST { action, ... } → move an order along, cancel it, record a refund, tracking or a note. */
export const POST = route(async (req, { params }) => {
  const u = await requireArea('orders');
  const b = await body(req);
  const action = str(b.action, 30);
  const allowed = ['confirm', 'pack', 'ship', 'out_for_delivery', 'deliver', 'tracking', 'cancel', 'refund_done', 'note'];
  if (!allowed.includes(action)) throw new StoreError('Unknown action');
  await orderAction((await params).number, {
    action, courier: str(b.courier, 60), awb: str(b.awb, 60), trackingUrl: str(b.trackingUrl, 300),
    reason: str(b.reason, 200), reference: str(b.reference, 80), note: str(b.note, 500),
  } as Parameters<typeof orderAction>[1], u.id);
  return { ok: true };
});
