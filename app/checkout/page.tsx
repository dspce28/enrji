import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ownStore } from '@/lib/db';
import { needUser } from '@/lib/store/pages';
import { listAddresses } from '@/lib/store/account';
import { getSettings } from '@/lib/store/settings';
import { testPayments } from '@/lib/store/orders';
import { razorpayEnabled } from '@/lib/store/razorpay';
import { Checkout } from '@/components/store/Checkout';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ buy?: string }> }) {
  if (!ownStore) redirect('/shop');
  const { buy } = await searchParams;
  const u = await needUser(buy ? `/checkout?buy=${encodeURIComponent(buy)}` : '/checkout');
  const [addresses, settings] = await Promise.all([listAddresses(u.id), getSettings()]);
  const m = /^(\d+)x(\d+)$/.exec(buy ?? '');
  return (
    <div className="container checkout-page">
      <header className="page-head" style={{ paddingBottom: 20 }}>
        <p className="eyebrow">Secure checkout</p>
        <h1 className="display h2" style={{ marginTop: 12 }}>Checkout</h1>
      </header>
      <Checkout
        buyNow={m ? { variantId: Number(m[1]), quantity: Math.min(10, Number(m[2]) || 1) } : null}
        addresses={addresses}
        email={u.email ?? ''}
        onlineMode={razorpayEnabled ? 'razorpay' : testPayments ? 'test' : 'off'}
        codEnabled={settings.cod.enabled}
      />
    </div>
  );
}
