import Link from 'next/link';
import { needStaff } from '@/lib/store/admin';
import { inventory } from '@/lib/store/adminCatalogue';
import { InventoryTable } from '@/components/admin/InventoryTable';

export const metadata = { title: 'Inventory' };

export default async function AdminInventory({ searchParams }: { searchParams: Promise<{ q?: string; low?: string; out?: string }> }) {
  await needStaff('inventory', '/admin/inventory');
  const sp = await searchParams;
  const rows = await inventory({ q: sp.q, low: sp.low === '1', out: sp.out === '1' });
  return (
    <>
      <header className="admin-head">
        <h1>Inventory <span>{rows.reduce((s, r) => s + r.v.stock, 0)} pieces</span></h1>
        <a className="btn btn-ghost btn-sm" href="/api/admin/inventory/export">Export stock file</a>
      </header>
      <nav className="tabs">
        <Link href="/admin/inventory" aria-current={!sp.low && !sp.out ? 'page' : undefined}>All</Link>
        <Link href="?low=1" aria-current={sp.low ? 'page' : undefined}>3 or fewer</Link>
        <Link href="?out=1" aria-current={sp.out ? 'page' : undefined}>Sold out</Link>
      </nav>
      <form className="afilters"><input name="q" defaultValue={sp.q} placeholder="Product or SKU" /><button className="btn btn-sm">Search</button></form>
      <InventoryTable rows={rows.map((r) => ({ id: r.v.id, title: r.title, productId: r.productId, status: r.status, size: r.v.size, color: r.v.color, sku: r.v.sku, stock: r.v.stock }))} />
    </>
  );
}
