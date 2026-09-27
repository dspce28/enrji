import Link from 'next/link';
import { notFound } from 'next/navigation';
import { needStaff } from '@/lib/store/admin';
import { returnDetail, RETURN_LABEL } from '@/lib/store/returns';
import { cdn } from '@/lib/format';
import { rs } from '@/lib/orderStatus';
import { ReturnAdminActions } from '@/components/admin/ReturnAdminActions';

export const metadata = { title: 'Return' };

export default async function AdminReturn({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await needStaff('returns', `/admin/returns/${id}`);
  const r = await returnDetail(Number(id));
  if (!r) notFound();
  return (
    <>
      <header className="admin-head">
        <h1>{r.type === 'exchange' ? 'Exchange' : 'Return'} #{r.id} <span className={`status status-r-${r.status}`}>{RETURN_LABEL[r.status]}</span></h1>
        <Link className="btn btn-ghost btn-sm" href="/admin/returns">← Returns</Link>
      </header>
      <ReturnAdminActions id={r.id} status={r.status} type={r.type} suggested={r.suggestedRefund} online={r.order.paymentMethod === 'razorpay'} />
      <div className="admin-cols wide-left">
        <section className="admin-card">
          <h2>Pieces</h2>
          <table className="atable">
            <thead><tr><th /><th>Product</th><th className="num">Qty</th>{r.type === 'exchange' ? <th>New size</th> : <th className="num">Value paid</th>}</tr></thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.orderItemId}>
                  <td>{l.item.image && <img src={cdn(l.item.image, 100)} alt="" className="athumb" />}</td>
                  <td>{l.item.title}<br /><span className="muted">{[l.item.color, `Size ${l.item.size}`].filter(Boolean).join(' · ')}</span></td>
                  <td className="num">{l.quantity}</td>
                  {r.type === 'exchange' ? <td><b>{l.swap?.size ?? '?'}</b> <span className="muted">({l.swap?.stock ?? 0} in stock)</span></td> : <td className="num">{rs(l.value)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p><b>Reason:</b> {r.reason}{r.comments && <><br /><b>Customer says:</b> {r.comments}</>}</p>
          {r.notes && <p><b>Notes:</b> {r.notes}</p>}
          {r.refundAmount != null && <p><b>Refunded:</b> {rs(r.refundAmount)} · ref {r.refundRef}</p>}
          {r.exchangeNumber && <p><b>Replacement order:</b> <Link href={`/admin/orders/${r.exchangeNumber}`}>{r.exchangeNumber}</Link></p>}
          {r.status !== 'requested' && <p className="muted">{r.restocked ? 'Returned pieces were added back to stock.' : ''}</p>}
        </section>
        <section className="admin-card">
          <h2>Order <Link href={`/admin/orders/${r.order.number}`}>{r.order.number}</Link></h2>
          <p>{r.order.address.name}<br />{[r.order.address.line1, r.order.address.line2].filter(Boolean).join(', ')}<br />{r.order.address.city}, {r.order.address.state} {r.order.address.pincode}<br />{r.order.address.phone}</p>
          <p>Paid {rs(r.order.total)} · {r.order.paymentMethod === 'cod' ? 'cash on delivery' : r.order.paymentMethod}</p>
        </section>
      </div>
    </>
  );
}
