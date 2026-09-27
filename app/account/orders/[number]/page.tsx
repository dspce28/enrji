import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { needUser } from '@/lib/store/pages';
import { orderDetail, PAYMENT_WINDOW_MIN } from '@/lib/store/orders';
import { AccountShell } from '@/components/store/AccountNav';
import { OrderActions } from '@/components/store/OrderActions';
import { cdn } from '@/lib/format';
import { PAYMENT_LABEL, rs, STATUS_LABEL, TRACK } from '@/lib/orderStatus';

export const metadata: Metadata = { title: 'Order', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ placed?: string; clear?: string; unpaid?: string }> }) {
  const { number } = await params;
  const sp = await searchParams;
  const u = await needUser(`/account/orders/${number}`);
  const o = await orderDetail(number, u.id);
  if (!o) notFound();
  const step = TRACK.indexOf(o.status as (typeof TRACK)[number]);
  const fmt = (d: Date) => d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const payBy = new Date(o.createdAt.getTime() + PAYMENT_WINDOW_MIN * 60_000);
  return (
    <AccountShell active="/account/orders" title={`Order ${o.number}`} admin={u.role !== 'customer'}>
      {sp.placed === '1' && o.status !== 'pending_payment' && o.status !== 'cancelled' && (
        <div className="banner good">Thank you! Your order is placed. We&apos;ll let you know when it ships.</div>
      )}
      {o.status === 'pending_payment' && (
        <div className="banner warn">{sp.unpaid ? 'Payment wasn’t completed. ' : ''}We&apos;re holding your items until {payBy.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}. Complete the payment to confirm the order.</div>
      )}
      {o.status === 'cancelled' && (
        <div className="banner warn">This order was cancelled{o.cancelReason ? ` (${o.cancelReason.replace(/^Customer: /, '')})` : ''}.{o.paymentStatus === 'refunded' ? ` ${rs(o.total)} has been refunded to your original payment method; it usually shows in 5–7 working days.` : o.paymentStatus === 'paid' ? ' Your refund is being processed.' : ''}</div>
      )}
      <OrderActions number={o.number} canPay={o.status === 'pending_payment'} canCancel={o.cancellable} clearVariants={sp.clear === '1' && o.status !== 'pending_payment' ? o.items.map((i) => i.variantId) : []} />

      {o.status !== 'cancelled' && o.status !== 'pending_payment' && (
        <ol className="track" aria-label="Order progress">
          {TRACK.map((s, i) => <li key={s} className={i <= step ? 'done' : ''}><span>{STATUS_LABEL[s]}</span></li>)}
        </ol>
      )}
      {o.awb && <p className="muted">Shipped with {o.courier} · AWB {o.awb}{o.trackingUrl && <> · <a href={o.trackingUrl} target="_blank" rel="noopener">Track package</a></>}</p>}

      <div className="order-detail">
        <div>
          <h3>Items</h3>
          {o.items.map((i) => (
            <div key={i.id} className="co-line">
              {i.image ? <img src={cdn(i.image, 160)} alt="" /> : <div className="co-ph" />}
              <div><Link href={`/products/${i.handle}`}><b>{i.title}</b></Link><span>{[i.color, `Size ${i.size}`, `Qty ${i.quantity}`].filter(Boolean).join(' · ')}</span></div>
              <span>{rs(i.unitPrice * i.quantity)}</span>
            </div>
          ))}
          <div className="totals">
            <div><span>Subtotal</span><span>{rs(o.subtotal)}</span></div>
            {o.offerDiscount > 0 && <div className="good"><span>Offer</span><span>−{rs(o.offerDiscount)}</span></div>}
            {o.couponDiscount > 0 && <div className="good"><span>Coupon {o.couponCode}</span><span>−{rs(o.couponDiscount)}</span></div>}
            <div><span>Shipping</span><span>{o.shipping ? rs(o.shipping) : 'Free'}</span></div>
            {o.codFee > 0 && <div><span>COD fee</span><span>{rs(o.codFee)}</span></div>}
            <div className="grand"><span>Total</span><span>{rs(o.total)}</span></div>
            <div className="fine">Includes {rs(o.taxIncluded)} GST · {PAYMENT_LABEL[o.paymentStatus] ?? o.paymentStatus}</div>
          </div>
        </div>
        <div>
          <h3>Delivering to</h3>
          <div className="address-text">
            <b>{o.address.name}</b>
            <div>{[o.address.line1, o.address.line2, o.address.landmark].filter(Boolean).join(', ')}</div>
            <div>{o.address.city}, {o.address.state} {o.address.pincode}</div>
            <div className="muted">{o.address.phone.replace(/^\+91/, '+91 ')}</div>
          </div>
          <h3 style={{ marginTop: 28 }}>History</h3>
          <ul className="events">
            {o.events.map((e) => <li key={e.id}><b>{STATUS_LABEL[e.status] ?? e.status}</b><span>{fmt(e.at)}</span>{e.note && <em>{e.note}</em>}</li>)}
          </ul>
        </div>
      </div>
    </AccountShell>
  );
}
