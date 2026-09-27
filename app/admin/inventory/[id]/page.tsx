import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db, schema } from '@/lib/db';
import { needStaff } from '@/lib/store/admin';
import { movements } from '@/lib/store/adminCatalogue';

export const metadata = { title: 'Stock history' };
const WHY: Record<string, string> = { import: 'Opening stock', restock: 'New stock', adjust: 'Adjustment', count: 'Count correction', damaged: 'Damaged / lost', order: 'Sold', cancel: 'Order cancelled', return: 'Returned', expired: 'Unpaid order released' };

export default async function StockHistory({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await needStaff('inventory', `/admin/inventory/${id}`);
  const [v] = await db().select({ v: schema.variants, title: schema.products.title }).from(schema.variants).innerJoin(schema.products, eq(schema.products.id, schema.variants.productId)).where(eq(schema.variants.id, Number(id)));
  if (!v) notFound();
  const rows = await movements(v.v.id);
  return (
    <>
      <header className="admin-head"><h1>{v.title} · {[v.v.color, v.v.size].filter(Boolean).join(' / ')} <span>{v.v.stock} in stock</span></h1><Link className="btn btn-ghost btn-sm" href="/admin/inventory">← Inventory</Link></header>
      <table className="atable">
        <thead><tr><th>When</th><th>What</th><th className="num">Change</th><th>Details</th><th>By</th></tr></thead>
        <tbody>
          {rows.map(({ m, by }) => (
            <tr key={m.id}>
              <td>{m.at.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
              <td>{WHY[m.reason] ?? m.reason}</td>
              <td className={`num ${m.delta < 0 ? 'neg' : 'pos'}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
              <td>{m.note}</td>
              <td className="muted">{by ?? (m.byUser ? 'staff' : 'system')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
