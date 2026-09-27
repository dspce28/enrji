import { NextResponse, type NextRequest } from 'next/server';
import { ownStore } from '@/lib/db';
import { markFailed, markPaid } from '@/lib/store/orders';
import { validWebhookSignature } from '@/lib/store/razorpay';

/**
 * Razorpay → us. Confirms payments even if the shopper closed the tab before returning. Set this URL in
 * Razorpay → Settings → Webhooks with the events payment.captured, order.paid and payment.failed, and put the
 * webhook secret in RAZORPAY_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  if (!ownStore) return NextResponse.json({ ok: false }, { status: 503 });
  const raw = await req.text();
  if (!validWebhookSignature(raw, req.headers.get('x-razorpay-signature') ?? '')) return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  const evt = JSON.parse(raw) as { event: string; payload: { payment?: { entity: { id: string; order_id: string } } } };
  const p = evt.payload.payment?.entity;
  try {
    if (p?.order_id && (evt.event === 'payment.captured' || evt.event === 'order.paid')) await markPaid({ razorpayOrderId: p.order_id }, p.id, evt);
    if (p?.order_id && evt.event === 'payment.failed') await markFailed(p.order_id, p.id, evt);
  } catch (e) {
    console.error('[razorpay webhook]', evt.event, e);
    // 200 anyway for unknown orders so Razorpay doesn't retry forever; real errors get retried.
    if (!(e instanceof Error && /not found/i.test(e.message))) return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
