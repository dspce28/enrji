import { notFound } from 'next/navigation';
import { needStaff } from '@/lib/store/admin';
import { adminOrder } from '@/lib/store/adminOrders';
import { getSettings } from '@/lib/store/settings';
import { PrintButton } from '@/components/admin/PrintButton';

export const metadata = { title: 'Packing slip' };

/** A plain printable packing slip to put in the parcel. */
export default async function Slip({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  await needStaff('orders', `/admin/orders/${number}/slip`);
  const [o, s] = await Promise.all([adminOrder(number), getSettings()]);
  if (!o) notFound();
  return (
    <div className="slip">
      <PrintButton />
      <header><b>{s.store.name || 'ENRJI'}</b><span>Packing slip · {o.number}</span></header>
      <div className="slip-to">
        <span>Deliver to</span>
        <p><b>{o.address.name}</b><br />{[o.address.line1, o.address.line2, o.address.landmark].filter(Boolean).join(', ')}<br />{o.address.city}, {o.address.state} {o.address.pincode}<br />Phone {o.address.phone}</p>
        {o.paymentMethod === 'cod' && o.paymentStatus === 'cod_pending' && <p className="slip-cod">COLLECT CASH: ₹{(o.total / 100).toLocaleString('en-IN')}</p>}
      </div>
      <table>
        <thead><tr><th>Item</th><th>Size</th><th>SKU</th><th>Qty</th><th>✓</th></tr></thead>
        <tbody>{o.items.map((i) => <tr key={i.id}><td>{i.title}{i.color ? ` · ${i.color}` : ''}</td><td>{i.size}</td><td>{i.sku}</td><td>{i.quantity}</td><td>☐</td></tr>)}</tbody>
      </table>
      <footer>Thank you for choosing ENRJI. Feel it · Live it.{s.store.address && <><br />{s.store.address}</>}</footer>
    </div>
  );
}
