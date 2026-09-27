import Link from 'next/link';
import { needStaff } from '@/lib/store/admin';
import { listCoupons, listOffers } from '@/lib/store/adminMisc';
import { rs } from '@/lib/orderStatus';
import { OfferEditor } from '@/components/admin/OfferEditor';

export const metadata = { title: 'Coupons & offers' };
const day = (d: Date | null) => (d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '');

export default async function AdminCoupons() {
  await needStaff('marketing', '/admin/coupons');
  const [coupons, offers] = await Promise.all([listCoupons(), listOffers()]);
  const now = new Date();
  return (
    <>
      <header className="admin-head"><h1>Coupons & offers</h1><Link className="btn btn-gold btn-sm" href="/admin/coupons/new">+ New coupon</Link></header>
      <section className="admin-card">
        <h2>Automatic offers</h2>
        <p className="muted">Applied at checkout without a code. A coupon that isn&apos;t “combinable” replaces the offer when it saves more.</p>
        {offers.map((o) => <OfferEditor key={o.id} offer={{ id: o.id, name: o.name, active: o.active, tiers: o.rules.tiers, startsAt: o.startsAt?.toISOString().slice(0, 10) ?? '', endsAt: o.endsAt?.toISOString().slice(0, 10) ?? '' }} />)}
        {!offers.length && <OfferEditor offer={null} />}
      </section>
      <section className="admin-card">
        <h2>Coupon codes</h2>
        <table className="atable">
          <thead><tr><th>Code</th><th>Discount</th><th>Rules</th><th>Valid</th><th className="num">Used</th><th>Status</th></tr></thead>
          <tbody>
            {coupons.map((c) => {
              const live = c.active && (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt >= now) && (c.usageLimit == null || c.used < c.usageLimit);
              return (
                <tr key={c.id}>
                  <td><Link href={`/admin/coupons/${c.id}`}><b>{c.code}</b></Link>{c.description && <><br /><span className="muted">{c.description}</span></>}</td>
                  <td>{c.type === 'percent' ? `${c.value}% off${c.maxDiscount ? ` (max ${rs(c.maxDiscount)})` : ''}` : c.type === 'flat' ? `${rs(c.value)} off` : 'Free shipping'}</td>
                  <td className="muted">{[c.minOrder ? `min ${rs(c.minOrder)}` : '', c.appliesTo !== 'all' ? `${c.appliesTo}s only` : '', c.firstOrderOnly ? 'first order' : '', `${c.perUserLimit}× per customer`, c.combinable ? 'stacks with offers' : ''].filter(Boolean).join(' · ')}</td>
                  <td>{c.startsAt || c.endsAt ? `${day(c.startsAt) || '…'} – ${day(c.endsAt) || '…'}` : 'Always'}</td>
                  <td className="num">{c.used}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                  <td><span className={`status ${live ? 'status-delivered' : 'status-cancelled'}`}>{live ? 'Live' : c.active ? 'Not live' : 'Off'}</span></td>
                </tr>
              );
            })}
            {!coupons.length && <tr><td colSpan={6} className="muted">No coupons yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
