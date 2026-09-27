import { needStaff } from '@/lib/store/admin';
import { report } from '@/lib/store/adminMisc';
import { rs } from '@/lib/orderStatus';

export const metadata = { title: 'Reports' };
const ist = (daysAgo = 0) => new Date(Date.now() + 5.5 * 3600_000 - daysAgo * 86400_000).toISOString().slice(0, 10);
const ok = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await needStaff('reports', '/admin/reports');
  const sp = await searchParams;
  const from = ok(sp.from) ?? ist(29), to = ok(sp.to) ?? ist(0);
  const r = await report(from, to);
  const s = r.summary;
  const csv = (kind: string) => `/api/admin/reports?from=${from}&to=${to}&kind=${kind}`;
  const peak = Math.max(1, ...r.byDay.map((d) => d.total));
  const gstTotal = r.gst.reduce((a, g) => a + g.cgst + g.sgst + g.igst, 0);
  return (
    <>
      <header className="admin-head"><h1>Reports</h1></header>
      <form className="afilters">
        <label>From <input type="date" name="from" defaultValue={from} /></label>
        <label>to <input type="date" name="to" defaultValue={to} /></label>
        <button className="btn btn-sm">Show</button>
        <span className="muted" style={{ fontSize: 12 }}>Counts placed orders (paid online or COD), not cancelled.</span>
      </form>
      <div className="kpis">
        <div className="kpi"><span>Net sales</span><b>{rs(s.total)}</b><em>{s.orders} orders{s.orders ? ` · avg ${rs(Math.round(s.total / s.orders))}` : ''}</em></div>
        <div className="kpi"><span>Discounts given</span><b>{rs(s.offer + s.coupon)}</b><em>offers {rs(s.offer)} · coupons {rs(s.coupon)}</em></div>
        <div className="kpi"><span>GST included</span><b>{rs(s.tax)}</b><em>shipping {rs(s.shipping)} · COD fees {rs(s.cod)}</em></div>
      </div>
      <section className="admin-card">
        <h2>Sales by day <a href={csv('days')}>CSV ↓</a></h2>
        <div className="bars tall">{r.byDay.map((d) => <div key={d.day} title={`${d.day}: ${rs(d.total)} (${d.orders})`}><i style={{ height: `${(d.total / peak) * 100}%` }} /><span>{d.day.slice(8)}</span></div>)}</div>
        {!r.byDay.length && <p className="muted">No sales in this period.</p>}
      </section>
      <div className="admin-cols">
        <section className="admin-card">
          <h2>Top products <a href={csv('products')}>CSV ↓</a></h2>
          <table className="atable compact"><thead><tr><th>Product</th><th className="num">Pieces</th><th className="num">Revenue</th></tr></thead>
            <tbody>{r.top.map((t) => <tr key={t.title}><td>{t.title}</td><td className="num">{t.qty}</td><td className="num">{rs(t.revenue)}</td></tr>)}</tbody></table>
        </section>
        <section className="admin-card">
          <h2>Payment methods</h2>
          <table className="atable compact"><thead><tr><th>Method</th><th className="num">Orders</th><th className="num">Value</th></tr></thead>
            <tbody>{r.byPay.map((p) => <tr key={p.method}><td>{p.method === 'cod' ? 'Cash on delivery' : p.method === 'razorpay' ? 'Online (Razorpay)' : p.method}</td><td className="num">{p.orders}</td><td className="num">{rs(p.total)}</td></tr>)}</tbody></table>
        </section>
      </div>
      <section className="admin-card">
        <h2>GST summary <a href={csv('gst')}>CSV ↓</a></h2>
        <p className="muted">Prices include GST. Orders delivered in {r.storeState || 'your state (set it in Settings)'} are split CGST + SGST; other states are IGST. For your accountant: check against GSTR-1 before filing.</p>
        <table className="atable compact">
          <thead><tr><th>HSN</th><th className="num">Rate</th><th className="num">Taxable value</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th></tr></thead>
          <tbody>
            {r.gst.map((g) => <tr key={`${g.hsn}${g.rate}`}><td>{g.hsn}</td><td className="num">{g.rate}%</td><td className="num">{rs(g.taxable)}</td><td className="num">{rs(g.cgst)}</td><td className="num">{rs(g.sgst)}</td><td className="num">{rs(g.igst)}</td></tr>)}
            {r.gst.length > 0 && <tr className="grand"><td colSpan={3}>Total tax</td><td colSpan={3} className="num">{rs(gstTotal)}</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
