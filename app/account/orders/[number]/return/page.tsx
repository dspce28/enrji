import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { needUser } from '@/lib/store/pages';
import { returnable, RETURN_REASONS } from '@/lib/store/returns';
import { AccountShell } from '@/components/store/AccountNav';
import { ReturnForm } from '@/components/store/ReturnForm';

export const metadata: Metadata = { title: 'Return or exchange', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function ReturnPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const u = await needUser(`/account/orders/${number}/return`);
  const r = await returnable(number, u.id);
  if (!r) notFound();
  const items = r.items.filter((i) => i.left > 0);
  return (
    <AccountShell active="/account/orders" title="Return or exchange" admin={u.role !== 'customer'}>
      <p className="muted" style={{ marginBottom: 20 }}>Order <Link href={`/account/orders/${number}`}>{number}</Link>{r.until && <> · returns open until {r.until.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>}</p>
      {!r.open ? <p>{r.until ? 'The return window for this order has closed.' : 'You can ask for a return or exchange once the order is delivered.'}</p>
        : !items.length ? <p>Everything from this order already has a return or exchange request.</p>
          : <ReturnForm number={number} items={items.map((i) => ({ id: i.id, title: i.title, size: i.size, color: i.color, image: i.image, left: i.left, swaps: i.swaps }))} reasons={RETURN_REASONS} exchangeOnly={r.exchangeOnly} />}
    </AccountShell>
  );
}
