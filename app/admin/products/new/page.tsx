import Link from 'next/link';
import { needStaff } from '@/lib/store/admin';
import { ProductEditor } from '@/components/admin/ProductEditor';

export const metadata = { title: 'New product' };

export default async function NewProduct() {
  await needStaff('catalogue', '/admin/products/new');
  const sizes = ['S', 'M', 'L', 'XL', '2XL'];
  return (
    <>
      <header className="admin-head"><h1>New product</h1><Link className="btn btn-ghost btn-sm" href="/admin/products">← Products</Link></header>
      <ProductEditor uploads={!!process.env.BLOB_READ_WRITE_TOKEN} initial={{
        title: '', handle: '', kind: 'tee', status: 'draft', limited: false, tags: '', story: '', details: '', care: '', hsn: '6109', seoTitle: '', seoDescription: '',
        images: [], variants: sizes.map((s) => ({ size: s, color: '', sku: '', price: '699', compareAt: '899', active: true, stock: 0, openingStock: '0' })),
      }} />
    </>
  );
}
