import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db, schema } from '@/lib/db';
import { needStaff } from '@/lib/store/admin';
import { CouponForm, type CouponFields } from '@/components/admin/CouponForm';

export const metadata = { title: 'Coupon' };
const blank: CouponFields = { code: '', description: '', type: 'percent', value: '10', minOrder: '', maxDiscount: '', appliesTo: 'all', startsAt: '', endsAt: '', usageLimit: '', perUserLimit: '1', firstOrderOnly: false, combinable: false, active: true };
const ist = (d: Date | null) => (d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10) : '');

export default async function CouponPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await needStaff('marketing', `/admin/coupons/${id}`);
  let initial = blank;
  if (id !== 'new') {
    const [c] = await db().select().from(schema.coupons).where(eq(schema.coupons.id, Number(id) || 0));
    if (!c) notFound();
    initial = {
      code: c.code, description: c.description ?? '', type: c.type, value: c.type === 'flat' ? String(c.value / 100) : String(c.value),
      minOrder: c.minOrder ? String(c.minOrder / 100) : '', maxDiscount: c.maxDiscount ? String(c.maxDiscount / 100) : '', appliesTo: c.appliesTo,
      startsAt: ist(c.startsAt), endsAt: ist(c.endsAt), usageLimit: c.usageLimit ? String(c.usageLimit) : '', perUserLimit: String(c.perUserLimit),
      firstOrderOnly: c.firstOrderOnly, combinable: c.combinable, active: c.active,
    };
  }
  return (
    <>
      <header className="admin-head"><h1>{id === 'new' ? 'New coupon' : initial.code}</h1><Link className="btn btn-ghost btn-sm" href="/admin/coupons">← Coupons</Link></header>
      <CouponForm id={id === 'new' ? undefined : Number(id)} initial={initial} />
    </>
  );
}
