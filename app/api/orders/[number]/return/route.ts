import { body, requireUser, route, str } from '@/lib/store/api';
import { requestReturn } from '@/lib/store/returns';

/** POST { type, reason, comments, items: [{ orderItemId, quantity, exchangeVariantId? }] }. */
export const POST = route(async (req, { params }) => {
  const u = await requireUser();
  const b = await body<{ type?: string; reason?: string; comments?: string; items?: { orderItemId: number; quantity: number; exchangeVariantId?: number }[] }>(req);
  const r = await requestReturn((await params).number, u.id, {
    type: b.type === 'exchange' ? 'exchange' : 'return', reason: str(b.reason, 60), comments: str(b.comments, 1000),
    items: (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((i) => ({ orderItemId: Number(i.orderItemId), quantity: Math.max(0, Math.floor(Number(i.quantity))), exchangeVariantId: i.exchangeVariantId ? Number(i.exchangeVariantId) : undefined })),
  });
  return { ok: true, id: r.id };
});
