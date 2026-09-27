import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, needStaff } from '@/lib/store/admin';
import { customerDetail } from '@/lib/store/adminMisc';
import { rs, STATUS_LABEL } from '@/lib/orderStatus';
import { BlockButton } from '@/components/admin/BlockButton';

export const metadata = { title: 'Customer' };

export default async function AdminCustomer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await needStaff('customers', `/admin/customers/${id}`);
  const c = /^[0-9a-f-]{36}$/.test(id) ? await customerDetail(id) : null;
  if (!c) notFound();
  return (
    <>
      <header className="admin-head"><h1>{c.name ?? c.phone}{c.blocked && <span className="status status-cancelled">On hold</span>}</h1><Link className="btn btn-ghost btn-sm" href="/admin/customers">← Customers</Link></header>
      <div className="kpis">
        <div className="kpi"><span>Orders</span><b>{c.orders.length}</b></div>
        <div className="kpi"><span>Spent</span><b>{rs(c.spent)}</b></div>
        <div className="kpi"><span>Customer since</span><b>{c.createdAt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</b></div>
      </div>
      <div className="admin-cols wide-left">
        <section className="admin-card">
          <h2>Orders</h2>
          <table className="atable">
            <thead><tr><th>Order</th><th>Date</th><th>Status</th><th className="num">Total</th></tr></thead>
            <tbody>{c.orders.map((o) => <tr key={o.id}><td><Link href={`/admin/orders/${o.number}`}>{o.number}</Link></td><td>{o.createdAt.toLocaleDateString('en-IN')}</td><td><span className={`status status-${o.status}`}>{STATUS_LABEL[o.status]}</span></td><td className="num">{rs(o.total)}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="admin-card">
          <h2>Contact</h2>
          <p>{c.phone}<br />{c.email ?? 'No email'}<br /><span className="muted">{c.marketingConsent ? 'Agreed to WhatsApp offers' : 'No marketing consent'}</span></p>
          <h3>Addresses</h3>
          {c.addresses.map((a) => <p key={a.id}>{a.name}<br />{a.line1}, {a.city}, {a.state} {a.pincode}</p>)}
          {can(me, 'staff') && <BlockButton id={c.id} blocked={c.blocked} />}
        </section>
      </div>
    </>
  );
}
