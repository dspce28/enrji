import Link from 'next/link';
import { notFound } from 'next/navigation';
import { needStaff } from '@/lib/store/admin';
import { productForEdit } from '@/lib/store/adminCatalogue';
import { ProductEditor } from '@/components/admin/ProductEditor';

export const metadata = { title: 'Edit product' };

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await needStaff('catalogue', `/admin/products/${id}`);
  const p = await productForEdit(Number(id));
  if (!p) notFound();
  return (
    <>
      <header className="admin-head"><h1>{p.title}</h1><div style={{ display: 'flex', gap: 10 }}><Link className="btn btn-ghost btn-sm" href={`/products/${p.handle}`} target="_blank">View on store ↗</Link><Link className="btn btn-ghost btn-sm" href="/admin/products">← Products</Link></div></header>
      <ProductEditor id={p.id} uploads={!!process.env.BLOB_READ_WRITE_TOKEN} initial={{
        title: p.title, handle: p.handle, kind: p.kind, status: p.status, limited: p.limited, tags: p.tags.join(', '),
        story: p.story.join('\n\n'), details: p.details.join('\n'), care: p.care ?? '', hsn: p.hsn, seoTitle: p.seoTitle ?? '', seoDescription: p.seoDescription ?? '',
        images: p.images.map((i) => ({ src: i.src, alt: i.alt })),
        variants: p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color ?? '', sku: v.sku ?? '', price: (v.price / 100).toString(), compareAt: v.compareAt ? (v.compareAt / 100).toString() : '', active: v.active, stock: v.stock })),
      }} />
    </>
  );
}
