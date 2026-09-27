'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCart } from '../cart';
import { cdn } from '@/lib/format';
import { AddressForm, AddressText, emptyAddress, type Address } from './AddressForm';
import { post } from './client';
import { openRazorpay, type PayStart } from './pay';
import { rs } from '@/lib/orderStatus';

interface QLine { variantId: number; title: string; size: string; color: string | null; image: string | null; unitPrice: number; compareAt: number | null; quantity: number; stock: number; problem?: 'unavailable' | 'short'; handle: string }
interface Quote {
  lines: QLine[]; subtotal: number; mrp: number; offerDiscount: number; offerName: string | null;
  coupon: { code: string; discount: number; freeShipping: boolean } | null; couponMessage: string | null;
  shipping: number; codFee: number; codAllowed: boolean; total: number; taxIncluded: number; ok: boolean;
}

export function Checkout({ buyNow, addresses: initialAddresses, email: initialEmail, onlineMode, codEnabled }: {
  buyNow: { variantId: number; quantity: number } | null;
  addresses: Address[]; email: string; onlineMode: 'razorpay' | 'test' | 'off'; codEnabled: boolean;
}) {
  const cart = useCart();
  const lines = useMemo(() => (buyNow ? [buyNow] : cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }))), [buyNow, cart.lines]);
  const [addresses, setAddresses] = useState(initialAddresses);
  const [addressId, setAddressId] = useState(initialAddresses.find((a) => a.isDefault)?.id ?? initialAddresses[0]?.id ?? '');
  const [adding, setAdding] = useState(!initialAddresses.length);
  const [payment, setPayment] = useState<'online' | 'cod'>(onlineMode === 'off' ? 'cod' : 'online');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [email, setEmail] = useState(initialEmail);
  const [q, setQ] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const seq = useRef(0);

  const reprice = useCallback(async () => {
    const n = ++seq.current;
    try {
      const r = await post<Quote>('/api/checkout/quote', { lines, coupon, payment });
      if (n !== seq.current) return;
      // A refused coupon is dropped from the order (its reason stays on screen), so checkout isn't blocked.
      if (coupon && !r.coupon && r.couponMessage && !/automatic offer/.test(r.couponMessage)) { setCouponError(r.couponMessage); setCoupon(null); return; }
      setQ(r);
    } catch (e) { if (n === seq.current) setError((e as Error).message); }
  }, [lines, coupon, payment]);
  useEffect(() => { if (lines.length) void reprice(); }, [reprice, lines.length]);
  useEffect(() => { if (q && !q.codAllowed && payment === 'cod' && onlineMode !== 'off') setPayment('online'); }, [q, payment, onlineMode]);

  if (!lines.length) {
    return <div className="empty-state"><p>Your bag is empty.</p><Link href="/shop" className="btn btn-gold">Shop the collection</Link></div>;
  }

  async function place() {
    if (!q) return;
    if (!addressId) { setError('Please add a delivery address.'); return; }
    setPlacing(true); setError(null);
    try {
      const r = await post<{ number: string; pay: PayStart | null }>('/api/checkout/place', { lines, coupon, addressId, payment, email, expectedTotal: q.total });
      const done = `/account/orders/${r.number}?placed=1${buyNow ? '' : '&clear=1'}`;
      if (!r.pay) { window.location.href = done; return; }
      if (r.pay.mode === 'test') { window.location.href = `/checkout/pay/${r.number}${buyNow ? '' : '?clear=1'}`; return; }
      await openRazorpay(r.pay, {
        onPaid: () => { window.location.href = done; },
        onDismiss: () => { window.location.href = `/account/orders/${r.number}?unpaid=1`; },
      });
    } catch (e) {
      const err = e as Error & { reprice?: boolean };
      setError(err.message);
      if (err.reprice || (err as { status?: number }).status === 409) await reprice();
      setPlacing(false);
    }
  }

  const problems = q?.lines.filter((l) => l.problem) ?? [];
  return (
    <div className="checkout">
      <div className="checkout-main">
        <section className="co-step">
          <h2><span>1</span> Delivery address</h2>
          {adding ? (
            <AddressForm initial={{ ...emptyAddress, isDefault: !addresses.length }} submitLabel="Deliver here"
              onCancel={addresses.length ? () => setAdding(false) : undefined}
              onSubmit={async (a) => {
                const r = await post<{ address: Address }>('/api/account/addresses', a);
                setAddresses((cur) => [r.address, ...cur.map((x) => (r.address.isDefault ? { ...x, isDefault: false } : x))]);
                setAddressId(r.address.id!); setAdding(false);
              }} />
          ) : (
            <div className="co-addresses">
              {addresses.map((a) => (
                <label key={a.id} className={`co-address${addressId === a.id ? ' on' : ''}`}>
                  <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id!)} />
                  <AddressText a={a} />
                </label>
              ))}
              <button className="link-btn" onClick={() => setAdding(true)}>+ Add a new address</button>
            </div>
          )}
        </section>

        <section className="co-step">
          <h2><span>2</span> Payment</h2>
          <div className="co-pay">
            {onlineMode !== 'off' && (
              <label className={`co-option${payment === 'online' ? ' on' : ''}`}>
                <input type="radio" name="pay" checked={payment === 'online'} onChange={() => setPayment('online')} />
                <div><b>Pay online</b><span>UPI, cards, net banking, wallets{onlineMode === 'test' ? ' · test gateway' : ''}</span></div>
              </label>
            )}
            {codEnabled && (
              <label className={`co-option${payment === 'cod' ? ' on' : ''}${q && !q.codAllowed ? ' disabled' : ''}`}>
                <input type="radio" name="pay" checked={payment === 'cod'} disabled={!!q && !q.codAllowed} onChange={() => setPayment('cod')} />
                <div><b>Cash on delivery</b><span>{q && !q.codAllowed ? 'Not available for this order' : q?.codFee ? `${rs(q.codFee)} COD fee` : 'Pay when it arrives'}</span></div>
              </label>
            )}
          </div>
          <label className="field" style={{ marginTop: 18 }}><span>Email for the invoice <em>(optional)</em></span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        </section>
      </div>

      <aside className="checkout-summary">
        <h2>Order summary</h2>
        <div className="co-lines">
          {(q?.lines ?? []).map((l) => (
            <div key={l.variantId} className={`co-line${l.problem ? ' bad' : ''}`}>
              {l.image ? <img src={cdn(l.image, 160)} alt="" /> : <div className="co-ph" />}
              <div>
                <b>{l.title}</b>
                <span>{[l.color, `Size ${l.size}`, `Qty ${l.quantity}`].filter(Boolean).join(' · ')}</span>
                {l.problem && <em>{l.problem === 'short' ? `Only ${l.stock} left` : 'Sold out'}: update your bag</em>}
              </div>
              <span>{rs(l.unitPrice * l.quantity)}</span>
            </div>
          ))}
        </div>
        <form className="co-coupon" onSubmit={(e) => { e.preventDefault(); setCouponError(null); setCoupon(couponInput.trim().toUpperCase() || null); }}>
          <input placeholder="Coupon code" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} maxLength={40} aria-label="Coupon code" />
          {coupon ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setCoupon(null); setCouponInput(''); setCouponError(null); }}>Remove</button> : <button className="btn btn-ghost btn-sm">Apply</button>}
        </form>
        {couponError && <p className="co-note">{couponError}</p>}
        {!couponError && q?.couponMessage && <p className={`co-note${q.coupon ? ' good' : ''}`}>{q.couponMessage}</p>}
        {q && (
          <div className="totals">
            {q.mrp > q.subtotal && <div><span>MRP</span><s>{rs(q.mrp)}</s></div>}
            <div><span>Subtotal</span><span>{rs(q.subtotal)}</span></div>
            {q.offerDiscount > 0 && <div className="good"><span>{q.offerName}</span><span>−{rs(q.offerDiscount)}</span></div>}
            {q.coupon && q.coupon.discount > 0 && <div className="good"><span>Coupon {q.coupon.code}</span><span>−{rs(q.coupon.discount)}</span></div>}
            <div><span>Shipping</span><span>{q.shipping ? rs(q.shipping) : 'Free'}</span></div>
            {q.codFee > 0 && <div><span>COD fee</span><span>{rs(q.codFee)}</span></div>}
            <div className="grand"><span>Total</span><span>{rs(q.total)}</span></div>
            <div className="fine">Includes {rs(q.taxIncluded)} GST</div>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-gold btn-block" disabled={!q || !q.ok || placing || adding || !!problems.length} onClick={place}>
          {placing ? 'Placing your order…' : payment === 'cod' ? `Place order · ${q ? rs(q.total) : ''}` : `Pay ${q ? rs(q.total) : ''}`}
        </button>
        {!buyNow && problems.length > 0 && <button className="link-btn" onClick={() => cart.setOpen(true)}>Update your bag</button>}
      </aside>
    </div>
  );
}
