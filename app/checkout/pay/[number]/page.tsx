import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { needUser } from '@/lib/store/pages';
import { orderDetail, testPayments } from '@/lib/store/orders';
import { TestGateway } from '@/components/store/TestGateway';

export const metadata: Metadata = { title: 'Test payment', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Staging only: a stand-in for Razorpay until the keys are added. */
export default async function TestPay({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ clear?: string }> }) {
  const { number } = await params;
  const u = await needUser(`/checkout/pay/${number}`);
  if (!testPayments) notFound();
  const o = await orderDetail(number, u.id);
  if (!o) notFound();
  if (o.status !== 'pending_payment') redirect(`/account/orders/${number}`);
  return (
    <div className="container auth-page">
      <div className="auth-card">
        <p className="eyebrow">Test payment gateway</p>
        <h1 className="display h2" style={{ marginTop: 12 }}>₹{(o.total / 100).toLocaleString('en-IN')}</h1>
        <p className="muted" style={{ marginTop: 10 }}>Order {o.number}. This stands in for Razorpay until the payment keys are added. No money moves.</p>
        <TestGateway number={o.number} clear={(await searchParams).clear === '1'} />
      </div>
    </div>
  );
}
