'use client';

import Link from 'next/link';
import { useCart } from './cart';
import { inr, cdn } from '@/lib/format';
import { MULTIBUY, PROMISES } from '@/lib/config';

export function CartDrawer() {
  const { lines, open, setOpen, count, subtotal, setQty, remove, checkout, unavailable } = useCart();
  const mrp = lines.reduce((s, l) => s + (l.compareAt ?? l.price) * l.quantity, 0);
  const blocked = lines.some((l) => unavailable.has(l.variantId));

  return (
    <>
      <div className={`overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} aria-hidden />
      <aside className={`drawer${open ? ' open' : ''}`} aria-label="Cart" aria-hidden={!open} inert={!open}>
        <div className="drawer-head">
          <h2>Your bag {count ? <span className="muted">({count})</span> : null}</h2>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close cart">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {!lines.length ? (
          <div className="empty">
            <p className="display h3" style={{ marginBottom: 12 }}>Nothing here yet</p>
            <p>Wear what you want to become.</p>
            <Link href="/shop" className="btn btn-gold" onClick={() => setOpen(false)} style={{ marginTop: 20 }}>Shop the collection</Link>
          </div>
        ) : (
          <>
            <div className="drawer-body">
              {lines.map((l) => (
                <div className="line" key={l.variantId}>
                  <Link href={`/products/${l.handle}`} onClick={() => setOpen(false)}>
                    {l.image ? <img src={cdn(l.image, 200)} alt="" loading="lazy" /> : <div style={{ width: 76, height: 100, background: 'var(--surface)', borderRadius: 10 }} />}
                  </Link>
                  <div>
                    <Link href={`/products/${l.handle}`} className="line-title" onClick={() => setOpen(false)}>{l.title}</Link>
                    <div className="line-meta">{[l.color, `Size ${l.size}`].filter(Boolean).join(' · ')}</div>
                    {unavailable.has(l.variantId) && <div className="line-warn">This size just sold out</div>}
                    <div className="qty">
                      <button onClick={() => setQty(l.variantId, l.quantity - 1)} aria-label="Decrease quantity">−</button>
                      <output>{l.quantity}</output>
                      <button onClick={() => setQty(l.variantId, l.quantity + 1)} aria-label="Increase quantity">+</button>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600 }}>{inr(l.price * l.quantity)}</div>
                    {l.compareAt ? <s className="muted" style={{ fontSize: 13 }}>{inr(l.compareAt * l.quantity)}</s> : null}
                    <div><button className="remove" onClick={() => remove(l.variantId)}>Remove</button></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="drawer-foot">
              <div className="totals">
                {mrp > subtotal && <div><span>MRP</span><s>{inr(mrp)}</s></div>}
                <div><span>Shipping</span><span>Free</span></div>
                <div className="grand"><span>Subtotal</span><span>{inr(subtotal)}</span></div>
              </div>
              <button className="btn btn-gold btn-block" onClick={checkout} disabled={blocked}>Checkout securely →</button>
              <p className="fine">Buy {MULTIBUY.map((t) => `${t.qty} save ${t.off}%`).join(' · ')}: eligible discounts are applied automatically at checkout. {PROMISES.payment}.</p>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
