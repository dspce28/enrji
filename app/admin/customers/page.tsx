import Link from 'next/link';
import { needStaff } from '@/lib/store/admin';
import { listCustomers } from '@/lib/store/adminMisc';
import { rs } from '@/lib/orderStatus';

export const metadata = { title: 'Customers' };

export default async function AdminCustomers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await needStaff('customers', '/admin/customers');
  const { q } = await searchParams;
  const rows = await listCustomers(q);
  return (
    <>
      <header className="admin-head"><h1>Customers <span>{rows.length}{rows.length === 300 ? '+' : ''}</span></h1></header>
      <form className="afilters"><input name="q" defaultValue={q} placeholder="Name, phone or email" /><button className="btn btn-sm">Search</button></form>
      <table className="atable">
        <thead><tr><th>Customer</th><th>Phone</th><th>Joined</th><th className="num">Orders</th><th className="num">Spent</th><th>Last order</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className={c.blocked ? 'dim' : ''}>
              <td><Link href={`/admin/customers/${c.id}`}><b>{c.name ?? '(no name yet)'}</b></Link>{c.blocked && <span className="muted"> · on hold</span>}{c.email && <><br /><span className="muted">{c.email}</span></>}</td>
              <td>{c.phone.replace('+91', '')}</td>
              <td>{c.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
              <td className="num">{c.orders}</td>
              <td className="num">{rs(c.spent)}</td>
              <td>{c.last ? new Date(c.last).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
