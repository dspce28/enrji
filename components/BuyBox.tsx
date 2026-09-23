'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Product } from '@/lib/catalogue';
import { useCart } from './cart';
import { Gallery } from './Gallery';
import { Price } from './Price';
import { checkoutUrl } from '@/lib/checkout';
import { MULTIBUY, PROMISES, whatsappLink } from '@/lib/config';
import { cdn, inr, titleCase } from '@/lib/format';
import { sizesFor } from '@/lib/sizes';

const SWATCH: Record<string, string> = { blue: '#1d4b66', navy: '#1a2140', black: '#111', white: '#eee', grey: '#777' };

export function ProductView({ p, twin }: { p: Product; twin: Pick<Product, 'handle' | 'kind' | 'price' | 'images'> | null }) {
  const { add, setOpen, toast } = useCart();
  const firstColor = p.colors.find((c) => p.variants.some((v) => v.color === c && v.available)) ?? p.colors[0] ?? null;
  const [color, setColor] = useState<string | null>(firstColor);
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [showSticky, setShowSticky] = useState(false);
  const buyRef = useRef<HTMLDivElement>(null);

  const variants = useMemo(() => p.variants.filter((v) => !color || v.color === color), [p.variants, color]);
  const variant = variants.find((v) => v.size === size) ?? null;
  const allOut = !variants.some((v) => v.available);

  useEffect(() => {
    // Keep the chosen size only if it's still buyable in the new colour.
    if (size && !variants.find((v) => v.size === size)?.available) setSize(null);
  }, [variants, size]);

  useEffect(() => {
    const el = buyRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const needSize = () => {
    toast('Choose your size first');
    document.getElementById('sizes')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const addToCart = () => {
    if (!variant) return needSize();
    add({
      variantId: variant.id, quantity: qty, handle: p.handle, title: titleCase(p.title), size: variant.size, color: variant.color,
      price: variant.price, compareAt: variant.compareAt, image: variant.image ?? p.images[0]?.src ?? null,
    });
    setOpen(true);
  };

  const buyNow = () => {
    if (!variant) return needSize();
    window.location.href = checkoutUrl([{ variantId: variant.id, quantity: qty }]);
  };

  const notifyText = `Hi ENRJI, please tell me when ${p.title}${color ? ` (${color})` : ''}${size ? ` in size ${size}` : ''} is back in stock.`;

  return (
    <div className="pdp">
      <Gallery images={p.images} color={color} title={titleCase(p.title)} />

      <div className="buybox">
        <div>
          <p className="eyebrow">{p.limited ? 'Limited edition · Live Like Krishna' : p.kind === 'tee' ? 'Half-sleeve tee · 220 GSM' : 'Sweatshirt · 250 GSM'}</p>
          <h1 style={{ marginTop: 14 }}>{p.title}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Price price={variant?.price ?? p.price} compareAt={variant?.compareAt ?? p.compareAt} showOff />
          <span className="muted" style={{ fontSize: 13 }}>Inclusive of all taxes</span>
        </div>
        {p.story[0] && <p className="muted" style={{ margin: 0, fontSize: 17 }}>{p.story[0]}</p>}

        {p.colors.length > 0 && (
          <div>
            <div className="opt-label">Colour <span>{color}</span></div>
            <div className="swatches">
              {p.colors.map((c) => (
                <button key={c} className="swatch" style={{ background: SWATCH[c.toLowerCase()] ?? '#444' }} aria-pressed={c === color} aria-label={c} title={c} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
        )}

        <div id="sizes">
          <div className="opt-label">Size <Link href="/size-guide" style={{ textDecoration: 'underline' }}>Size guide</Link></div>
          <div className="sizes">
            {variants.map((v) => (
              <button
                key={v.id}
                className="size"
                aria-pressed={v.size === size}
                aria-disabled={!v.available}
                aria-label={`${v.size}${v.available ? '' : ', sold out'}`}
                onClick={() => (v.available ? setSize(v.size) : toast(`${v.size} is sold out — we can tell you when it's back`))}
              >{v.size}</button>
            ))}
          </div>
          <p className={`stock-note${allOut ? ' out' : ''}`} style={{ marginTop: 10 }}>
            {allOut ? 'Sold out in every size.' : variant ? `✓ Size ${variant.size} is in stock` : p.limited ? 'Relaxed fit — between sizes? Go one up.' : 'Unisex regular fit.'}
          </p>
        </div>

        <div ref={buyRef} style={{ display: 'grid', gap: 10 }}>
          {allOut ? (
            <a className="btn btn-light btn-block" href={whatsappLink(notifyText)} target="_blank" rel="noopener">Notify me on WhatsApp when it&apos;s back</a>
          ) : (
            <>
              <div className="buy-row">
                <div className="qty" aria-label="Quantity">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">−</button>
                  <output>{qty}</output>
                  <button onClick={() => setQty((q) => Math.min(10, q + 1))} aria-label="Increase">+</button>
                </div>
                <button className="btn btn-ghost" onClick={addToCart}>Add to bag</button>
              </div>
              <button className="btn btn-gold btn-block" onClick={buyNow}>Buy now{variant ? ` · ${inr(variant.price * qty)}` : ''}</button>
              {variants.some((v) => !v.available) && (
                <a href={whatsappLink(notifyText)} target="_blank" rel="noopener" className="muted" style={{ fontSize: 13, textDecoration: 'underline', textAlign: 'center' }}>Your size sold out? Get notified on WhatsApp</a>
              )}
            </>
          )}
        </div>

        <div className="offer">
          {MULTIBUY.map((t) => <div key={t.qty}><b>Buy {t.qty}, save {t.off}%</b>Applied at checkout</div>)}
        </div>

        <Link href={`/trial-room?product=${p.handle}`} className="twin" style={{ borderStyle: 'dashed' }}>
          <span style={{ width: 56, height: 56, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(217,171,82,.12)', fontSize: 24 }} aria-hidden>📸</span>
          <span><b>Try it on you</b><br /><span className="muted" style={{ fontSize: 14 }}>See this piece on your own photo in the Trial Room</span></span>
        </Link>

        {twin && (
          <Link href={`/products/${twin.handle}`} className="twin">
            {twin.images[0] && <img src={cdn(twin.images[0].src, 160)} alt="" loading="lazy" />}
            <span><span className="muted" style={{ fontSize: 13 }}>Also available as a</span><br /><b>{twin.kind === 'tee' ? 'Half-sleeve tee' : 'Sweatshirt'} · {inr(twin.price)}</b></span>
          </Link>
        )}

        <ul className="promises">
          <li>{PROMISES.shipping} · {PROMISES.dispatch.toLowerCase()}</li>
          <li>{PROMISES.payment}</li>
          <li>{PROMISES.returns}</li>
        </ul>

        <div>
          {p.story.length > 1 && (
            <details className="acc" open>
              <summary>The story</summary>
              <div className="acc-body">{p.story.slice(1).map((s, i) => <p key={i} style={{ margin: '0 0 12px' }}>{s}</p>)}</div>
            </details>
          )}
          {p.details.length > 0 && (
            <details className="acc">
              <summary>Fabric & fit</summary>
              <div className="acc-body"><ul>{p.details.map((d, i) => <li key={i}>{d}</li>)}</ul></div>
            </details>
          )}
          {p.care && (
            <details className="acc">
              <summary>Care</summary>
              <div className="acc-body">{p.care}</div>
            </details>
          )}
          <details className="acc">
            <summary>Size chart</summary>
            <div className="acc-body">
              <table className="size-table">
                <thead><tr><th>Size</th><th>Chest (in)</th><th>Length (in)</th></tr></thead>
                <tbody>{sizesFor(p.kind).map((s) => <tr key={s.size}><td>{s.size}</td><td>{s.chest}</td><td>{s.length}</td></tr>)}</tbody>
              </table>
              <p style={{ fontSize: 13, marginTop: 10 }}>Measured flat across the garment. Chest is the full circumference.{p.kind === 'sweatshirt' && p.sizes.includes('3XL') ? ' 3XL measurements aren’t published yet — message us on WhatsApp before ordering.' : ''}</p>
            </div>
          </details>
          <details className="acc">
            <summary>Shipping & returns</summary>
            <div className="acc-body">
              <p style={{ marginTop: 0 }}>{PROMISES.shipping}. {PROMISES.dispatch}, {PROMISES.delivery.toLowerCase()}. Tracking arrives by email or WhatsApp.</p>
              <p style={{ marginBottom: 0 }}>{PROMISES.returns} <Link href="/faq" style={{ textDecoration: 'underline' }}>Read the details</Link>.</p>
            </div>
          </details>
        </div>
      </div>

      <div className={`sticky-buy${showSticky && !allOut ? ' show' : ''}`}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleCase(p.baseName)}</div>
          <div className="muted" style={{ fontSize: 13 }}>{variant ? `Size ${variant.size}` : 'Choose a size'} · {inr(variant?.price ?? p.price)}</div>
        </div>
        <button className="btn btn-gold btn-sm" onClick={variant ? addToCart : needSize}>{variant ? 'Add to bag' : 'Choose size'}</button>
      </div>
    </div>
  );
}
