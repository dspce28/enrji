import Link from 'next/link';
import { notFound } from 'next/navigation';
import { needStaff } from '@/lib/store/admin';
import { adminOrder, NEXT_STEP } from '@/lib/store/adminOrders';
import { cdn } from '@/lib/format';
import { PAYMENT_LABEL, rs, STATUS_LABEL } from '@/lib/orderStatus';
import { OrderAdminActions } from '@/components/admin/OrderAdminActions';

export const metadata = { title: 'Order' };

export default async function AdminOrder({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  await needStaff('orders', `/admin/orders/${number}`);
  const o = await adminOrder(number);
  if (!o) notFound();
  const next = NEXT_STEP[o.status];
  const fmt = (d: Date) => d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <>
      <header className="admin-head">
        <h1>{o.number} <span className={`status status-${o.status}`}>{STATUS_LABEL[o.status]}</span></h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link className="btn btn-ghost btn-sm" href={`/admin/orders/${o.number}/slip`} target="_blank">Packing slip</Link>
          <Link className="btn btn-ghost btn-sm" href="/admin/orders">← Orders</Link>
        </div>
      </header>
      <OrderAdminActions number={o.number} next={next ?? null} status={o.status} refundDue={o.status === 'cancelled' && o.paymentStatus === 'paid'}
        tracking={{ courier: o.courier ?? '', awb: o.awb ?? '', trackingUrl: o.trackingUrl ?? '' }} />
      <div className="admin-cols wide-left">
        <section className="admin-card">
          <h2>Items</h2>
          <table className="atable">
            <thead><tr><th /><th>Product</th><th>SKU</th><th className="num">Price</th><th className="num">Qty</th><th className="num">Line</th></tr></thead>
            <tbody>
              {o.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.image && <img src={cdn(i.image, 100)} alt="" className="athumb" />}</td>
                  <td>{i.title}<br /><span className="muted">{[i.color, i.size].filter(Boolean).join(' / ')} · HSN {i.hsn} · GST {i.gstRate}%</span></td>
                  <td className="muted">{i.sku}</td>
                  <td className="num">{rs(i.unitPrice)}</td>
                  <td className="num">{i.quantity}</td>
                  <td className="num">{rs(i.unitPrice * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals">
            <div><span>Subtotal</span><span>{rs(o.subtotal)}</span></div>
            {o.offerDiscount > 0 && <div><span>Offer</span><span>−{rs(o.offerDiscount)}</span></div>}
            {o.couponDiscount > 0 && <div><span>Coupon {o.couponCode}</span><span>−{rs(o.couponDiscount)}</span></div>}
            <div><span>Shipping</span><span>{o.shipping ? rs(o.shipping) : 'Free'}</span></div>
            {o.codFee > 0 && <div><span>COD fee</span><span>{rs(o.codFee)}</span></div>}
            <div className="grand"><span>Total</span><span>{rs(o.total)}</span></div>
            <div><span>GST included</span><span>{rs(o.taxIncluded)}</span></div>
          </div>
        </section>
        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <section className="admin-card">
            <h2>Customer</h2>
            <p><b>{o.customer?.name ?? '—'}</b><br />{o.customer?.phone}{o.email && <><br />{o.email}</>}<br />
              <Link href={`/admin/customers/${o.userId}`}>{o.customerOrders} order{o.customerOrders === 1 ? '' : 's'} →</Link></p>
            <h3>Ship to</h3>
            <p>{o.address.name}<br />{[o.address.line1, o.address.line2, o.address.landmark].filter(Boolean).join(', ')}<br />{o.address.city}, {o.address.state} {o.address.pincode}<br />{o.address.phone}</p>
          </section>
          <section className="admin-card">
            <h2>Payment</h2>
            <p>{o.paymentMethod === 'cod' ? 'Cash on delivery' : o.paymentMethod === 'test' ? 'Test gateway' : 'Razorpay'} · <b>{PAYMENT_LABEL[o.paymentStatus]}</b>
              {o.razorpayPaymentId && <><br /><span className="muted">{o.razorpayPaymentId}</span></>}</p>
            {o.awb && <><h3>Shipment</h3><p>{o.courier} · {o.awb}{o.trackingUrl && <><br /><a href={o.trackingUrl} target="_blank" rel="noopener">Tracking link ↗</a></>}</p></>}
            {o.returns.length > 0 && <><h3>Returns</h3>{o.returns.map((r) => <p key={r.id}><Link href={`/admin/returns/${r.id}`}>#{r.id} {r.type} · {r.status}</Link></p>)}</>}
          </section>
          <section className="admin-card">
            <h2>History</h2>
            <ul className="events">
              {o.events.map(({ e, by }) => <li key={e.id}><b>{STATUS_LABEL[e.status] ?? (e.status === 'note' ? 'Note' : e.status)}</b><span>{fmt(e.at)}{by ? ` · ${by}` : ''}</span>{e.note && <em>{e.note}</em>}</li>)}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
