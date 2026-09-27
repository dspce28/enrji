import type { Metadata } from 'next';
import Link from 'next/link';
import { needUser } from '@/lib/store/pages';
import { ordersFor } from '@/lib/store/orders';
import { AccountShell } from '@/components/store/AccountNav';
import { cdn } from '@/lib/format';
import { rs, STATUS_LABEL } from '@/lib/orderStatus';

export const metadata: Metadata = { title: 'Your orders', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Orders() {
  const u = await needUser('/account/orders');
  const list = await ordersFor(u.id);
  return (
    <AccountShell active="/account/orders" title="Orders" admin={u.role !== 'customer'}>
      {!list.length ? (
        <div className="empty-state"><p>No orders yet.</p><Link href="/shop" className="btn btn-gold">Start shopping</Link></div>
      ) : (
        <div className="order-list">
          {list.map((o) => (
            <Link key={o.id} href={`/account/orders/${o.number}`} className="order-row">
              <div className="order-thumbs">{o.items.slice(0, 3).map((i) => (i.image ? <img key={i.id} src={cdn(i.image, 120)} alt="" /> : null))}</div>
              <div>
                <b>{o.number}</b>
                <span className="muted">{o.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {o.items.reduce((s, i) => s + i.quantity, 0)} item(s)</span>
              </div>
              <span className={`status status-${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
              <b>{rs(o.total)}</b>
            </Link>
          ))}
        </div>
      )}
    </AccountShell>
  );
}
