import Link from 'next/link';
import { needStaff } from '@/lib/store/admin';
import { listOrders } from '@/lib/store/adminOrders';
import { PAYMENT_LABEL, rs, STATUS_LABEL } from '@/lib/orderStatus';

export const metadata = { title: 'Orders' };
const TABS = [['', 'All'], ['placed', 'To confirm'], ['confirmed', 'To pack'], ['packed', 'To ship'], ['shipped', 'In transit'], ['delivered', 'Delivered'], ['pending_payment', 'Awaiting payment'], ['cancelled', 'Cancelled']];

export default async function AdminOrders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await needStaff('orders', '/admin/orders');
  const sp = await searchParams;
  const f = { status: sp.status, q: sp.q, payment: sp.payment, refund: sp.refund === '1', page: Number(sp.page) || 1 };
  const { rows, total, page, pages } = await listOrders(f);
  const qs = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v !== undefined && v !== '') as [string, string][]);
    return `?${p}`;
  };
  return (
    <>
      <header className="admin-head">
        <h1>Orders <span>{total}</span></h1>
        <a className="btn btn-ghost btn-sm" href={`/api/admin/orders/export${qs({ page: undefined })}`}>Export CSV</a>
      </header>
      <nav className="tabs">
        {TABS.map(([s, label]) => <Link key={s} href={qs({ status: s || undefined, page: undefined, refund: undefined })} aria-current={(sp.status ?? '') === s && !f.refund ? 'page' : undefined}>{label}</Link>)}
        <Link href="?refund=1" aria-current={f.refund ? 'page' : undefined}>Refunds due</Link>
      </nav>
      <form className="afilters">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <input name="q" defaultValue={sp.q} placeholder="Order no., name, phone or AWB" />
        <select name="payment" defaultValue={sp.payment ?? ''}><option value="">Any payment</option><option value="razorpay">Online</option><option value="cod">COD</option><option value="test">Test</option></select>
        <button className="btn btn-sm">Search</button>
      </form>
      <table className="atable">
        <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Payment</th><th>Status</th><th className="num">Total</th></tr></thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td><Link href={`/admin/orders/${o.number}`}><b>{o.number}</b></Link></td>
              <td>{o.createdAt.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
              <td>{o.address.name}<br /><span className="muted">{o.address.city} · {o.address.phone.replace('+91', '')}</span></td>
              <td>{o.pieces}</td>
              <td>{PAYMENT_LABEL[o.paymentStatus]}</td>
              <td><span className={`status status-${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
              <td className="num">{rs(o.total)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="muted">No orders here.</td></tr>}
        </tbody>
      </table>
      {pages > 1 && (
        <div className="pager">
          {page > 1 && <Link href={qs({ page: page - 1 })}>← Newer</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link href={qs({ page: page + 1 })}>Older →</Link>}
        </div>
      )}
    </>
  );
}
