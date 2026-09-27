import { body, route, str, StoreError } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';
import { returnAction } from '@/lib/store/returns';

/** POST { action, ... } → approve, reject, picked_up, receive, refund, exchange, note. */
export const POST = route(async (req, { params }) => {
  const u = await requireArea('returns');
  const b = await body(req);
  const action = str(b.action, 20);
  if (!['approve', 'reject', 'picked_up', 'receive', 'refund', 'exchange', 'note'].includes(action)) throw new StoreError('Unknown action');
  await returnAction(Number((await params).id), {
    action, note: str(b.note, 500), restock: b.restock !== false, amount: Math.round(Number(b.amount) * 100), reference: str(b.reference, 80),
  } as Parameters<typeof returnAction>[1], u.id);
  return { ok: true };
});
