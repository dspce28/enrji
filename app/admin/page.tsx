import Link from 'next/link';
import { needStaff } from '@/lib/store/admin';
import { dashboard } from '@/lib/store/adminData';
import { rs, STATUS_LABEL } from '@/lib/orderStatus';

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await needStaff('dashboard');
  const d = await dashboard();
  const days = Array.from({ length: 14 }, (_, i) => {
    const t = new Date(Date.now() + 5.5 * 3600_000 - (13 - i) * 86400_000).toISOString().slice(0, 10);
    return { day: t, revenue: d.daily.find((x) => x.day === t)?.revenue ?? 0 };
  });
  const peak = Math.max(1, ...days.map((x) => x.revenue));
  const q = d.queue;
  return (
    <>
      <header className="admin-head"><h1>Dashboard</h1></header>
      {(await searchParams).denied && <div className="banner warn">You don&apos;t have access to that page. Ask an admin if you need it.</div>}
      <div className="kpis">
        {[['Today', d.today], ['Last 7 days', d.week], ['Last 30 days', d.month]].map(([label, p]) => {
          const x = p as { revenue: number; orders: number };
          return (
            <div key={label as string} className="kpi">
              <span>{label as string}</span>
              <b>{rs(x.revenue)}</b>
              <em>{x.orders} order{x.orders === 1 ? '' : 's'}{x.orders ? ` · avg ${rs(Math.round(x.revenue / x.orders))}` : ''}</em>
            </div>
          );
        })}
      </div>

      <section className="admin-card">
        <h2>Needs attention</h2>
        <div className="queue">
          <Link href="/admin/orders?status=placed"><b>{q.toConfirm}</b><span>To confirm</span></Link>
          <Link href="/admin/orders?status=confirmed"><b>{q.toPack}</b><span>To pack</span></Link>
          <Link href="/admin/orders?status=packed"><b>{q.toShip}</b><span>To ship</span></Link>
          <Link href="/admin/orders?status=shipped"><b>{q.inTransit}</b><span>In transit</span></Link>
          <Link href="/admin/returns"><b>{q.returns}</b><span>Open returns</span></Link>
          <Link href="/admin/orders?refund=1" className={q.refundsDue ? 'alert' : ''}><b>{q.refundsDue}</b><span>Refunds to issue</span></Link>
        </div>
      </section>

      <div className="admin-cols">
        <section className="admin-card">
          <h2>Sales, last 14 days</h2>
          <div className="bars" role="img" aria-label="Daily sales for the last 14 days">
            {days.map((x) => (
              <div key={x.day} title={`${x.day}: ${rs(x.revenue)}`}>
                <i style={{ height: `${(x.revenue / peak) * 100}%` }} />
                <span>{x.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-card">
          <h2>Low stock <Link href="/admin/inventory?low=1">All →</Link></h2>
          {d.lowStock.length ? (
            <table className="atable compact"><tbody>
              {d.lowStock.map((v) => (
                <tr key={v.id}><td>{v.title}</td><td>{[v.color, v.size].filter(Boolean).join(' / ')}</td><td className={v.stock === 0 ? 'neg' : 'warn'}>{v.stock}</td></tr>
              ))}
            </tbody></table>
          ) : <p className="muted">Everything has more than 3 in stock.</p>}
        </section>
      </div>

      <section className="admin-card">
        <h2>Latest orders <Link href="/admin/orders">All →</Link></h2>
        <table className="atable">
          <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Payment</th><th className="num">Total</th><th>Placed</th></tr></thead>
          <tbody>
            {d.recent.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/admin/orders/${o.number}`}>{o.number}</Link></td>
                <td>{o.address.name}</td>
                <td><span className={`status status-${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
                <td>{o.paymentMethod.toUpperCase()}</td>
                <td className="num">{rs(o.total)}</td>
                <td>{o.createdAt.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
