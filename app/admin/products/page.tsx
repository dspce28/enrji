import Link from 'next/link';
import { needStaff } from '@/lib/store/admin';
import { listProducts } from '@/lib/store/adminCatalogue';
import { cdn } from '@/lib/format';
import { rs } from '@/lib/orderStatus';

export const metadata = { title: 'Products' };

export default async function AdminProducts({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await needStaff('catalogue', '/admin/products');
  const sp = await searchParams;
  const rows = await listProducts(sp);
  return (
    <>
      <header className="admin-head"><h1>Products <span>{rows.length}</span></h1><Link className="btn btn-gold btn-sm" href="/admin/products/new">+ New product</Link></header>
      <form className="afilters">
        <input name="q" defaultValue={sp.q} placeholder="Search products" />
        <select name="status" defaultValue={sp.status ?? ''}><option value="">Any status</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
        <button className="btn btn-sm">Filter</button>
      </form>
      <table className="atable">
        <thead><tr><th /><th>Product</th><th>Type</th><th>Status</th><th className="num">Sizes</th><th className="num">In stock</th><th className="num">Price</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.image && <img src={cdn(p.image, 100)} alt="" className="athumb" />}</td>
              <td><Link href={`/admin/products/${p.id}`}><b>{p.title}</b></Link><br /><span className="muted">/{p.handle}{p.limited ? ' · limited' : ''}</span></td>
              <td>{p.kind}</td>
              <td><span className={`status status-p-${p.status}`}>{p.status}</span></td>
              <td className="num">{p.variants}</td>
              <td className={`num${p.stock === 0 ? ' neg' : ''}`}>{p.stock}</td>
              <td className="num">{p.minPrice === p.maxPrice ? rs(p.minPrice) : `${rs(p.minPrice)}–${rs(p.maxPrice)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
