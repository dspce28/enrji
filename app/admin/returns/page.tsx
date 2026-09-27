import Link from 'next/link';
import { needStaff } from '@/lib/store/admin';
import { listReturns, RETURN_LABEL } from '@/lib/store/returns';

export const metadata = { title: 'Returns' };
const TABS = [['open', 'Open'], ['requested', 'New'], ['approved', 'Approved'], ['received', 'Received'], ['refunded', 'Refunded'], ['exchanged', 'Exchanged'], ['rejected', 'Rejected']];

export default async function AdminReturns({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await needStaff('returns', '/admin/returns');
  const status = (await searchParams).status ?? 'open';
  const rows = await listReturns(status);
  return (
    <>
      <header className="admin-head"><h1>Returns & exchanges <span>{rows.length}</span></h1></header>
      <nav className="tabs">{TABS.map(([s, l]) => <Link key={s} href={`?status=${s}`} aria-current={status === s ? 'page' : undefined}>{l}</Link>)}</nav>
      <table className="atable">
        <thead><tr><th>#</th><th>Order</th><th>Customer</th><th>Type</th><th>Reason</th><th>Status</th><th>Requested</th></tr></thead>
        <tbody>
          {rows.map(({ r, number, name }) => (
            <tr key={r.id}>
              <td><Link href={`/admin/returns/${r.id}`}><b>#{r.id}</b></Link></td>
              <td><Link href={`/admin/orders/${number}`}>{number}</Link></td>
              <td>{name}</td>
              <td>{r.type === 'exchange' ? 'Exchange' : 'Return'} · {r.items.reduce((s, i) => s + i.quantity, 0)} pc</td>
              <td>{r.reason}</td>
              <td><span className={`status status-r-${r.status}`}>{RETURN_LABEL[r.status]}</span></td>
              <td>{r.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="muted">Nothing here.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
