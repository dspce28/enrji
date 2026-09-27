import type { Metadata } from 'next';
import Link from 'next/link';
import { needUser } from '@/lib/store/pages';
import { wishlistIds } from '@/lib/store/account';
import { getProducts } from '@/lib/catalogue';
import { AccountShell } from '@/components/store/AccountNav';
import { ProductCard } from '@/components/ProductCard';

export const metadata: Metadata = { title: 'Wishlist', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Wishlist() {
  const u = await needUser('/account/wishlist');
  const [ids, all] = await Promise.all([wishlistIds(u.id), getProducts()]);
  const items = ids.map((id) => all.find((p) => p.id === id)).filter((p) => !!p);
  return (
    <AccountShell active="/account/wishlist" title="Wishlist" admin={u.role !== 'customer'}>
      {items.length ? (
        <div className="grid grid-3">{items.map((p) => <ProductCard key={p.handle} p={p} sizes="(max-width: 760px) 50vw, 25vw" />)}</div>
      ) : (
        <div className="empty-state"><p>Nothing saved yet. Tap the heart on any piece to keep it here.</p><Link href="/shop" className="btn btn-gold">Explore the collection</Link></div>
      )}
    </AccountShell>
  );
}
