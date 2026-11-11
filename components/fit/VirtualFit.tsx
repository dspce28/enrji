'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCart } from '../cart';
import { inr } from '@/lib/format';
import './fit.css';

export interface FitVariant { id: number; size: string; color: string | null; available: boolean; price: number; compareAt: number | null; image: string | null }
export interface FitItem {
  id: number; handle: string; name: string; title: string; kind: 'tee' | 'sweatshirt'; image: string | null;
  model: string; garment: string; colors: [string, string][]; variants: FitVariant[];
}
export interface FitModel { key: string; label: string; items: FitItem[] }

// Arc geometry (share of the window width at 0, 1, 2 … 5 steps from the centre).
const XS_DESK = [0, 0.215, 0.345, 0.432, 0.49, 0.52];
const XS_PHONE = [0, 0.36, 0.5, 0.56, 0.6, 0.62];
const SCAN_EASE = 'cubic-bezier(.65,0,.35,1)';
const ROLL = { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)' };
const mod = (n: number, m: number) => ((n % m) + m) % m;
const xAt = (xs: number[], a: number) => {
  if (a >= xs.length - 1) return xs[xs.length - 1];
  const i = Math.floor(a);
  return xs[i] + (xs[i + 1] - xs[i]) * (a - i);
};

/** Text that rolls up when it changes: the old line slides out the top as the new one rises in. */
function Roll({ text, still }: { text: string; still: boolean }) {
  const box = useRef<HTMLSpanElement>(null);
  const prev = useRef(text);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || prev.current === text) return;
    const before = prev.current;
    prev.current = text;
    if (still) return;
    const old = document.createElement('span');
    old.className = 'vf-roll-old';
    old.textContent = before;
    el.appendChild(old);
    old.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-110%)' }], ROLL).onfinish = () => old.remove();
    el.firstElementChild?.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }], ROLL);
  }, [text, still]);
  return <span className="vf-ln" ref={box}><span>{text}</span></span>;
}

const Icon = {
  home: <path d="M4 11.5 12 5l8 6.5V20h-5.5v-5h-5v5H4z" />,
  tee: <path d="M8.5 4 4 6.5 5.6 10l2.4-1V20h8V9l2.4 1L20 6.5 15.5 4a3.5 3.5 0 0 1-7 0z" fill="currentColor" stroke="none" />,
  tag: <><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7L20.5 11.8a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0z" /><circle cx="8" cy="8" r="1.4" /></>,
  bag: <><path d="M5 8h14l-1.2 12H6.2z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  left: <path d="m14.5 6-6 6 6 6" />,
  right: <path d="m9.5 6 6 6-6 6" />,
};
const Svg = ({ d, size = 20 }: { d: React.ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);

export function VirtualFit({ models, initialModel, initialHandle }: { models: FitModel[]; initialModel: string; initialHandle: string | null }) {
  const { add, setOpen, count, toast } = useCart();
  const [modelKey, setModelKey] = useState(initialModel);
  const model = models.find((m) => m.key === modelKey) ?? models[0];
  const items = model.items;
  const N = items.length;
  // At least ten cards on the arc, so it loops without a gap.
  const C = N >= 10 ? N : N * Math.ceil(10 / N);
  const startAt = Math.max(0, items.findIndex((i) => i.handle === initialHandle));

  const [cur, setCur] = useState(startAt);
  const item = items[Math.min(cur, N - 1)];
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState(0);
  const [still, setStill] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const room = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const mCur = useRef<HTMLDivElement>(null);
  const mNext = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const scan = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  // Everything the animation loop reads and writes, kept out of React state.
  const S = useRef({
    pos: startAt, target: startAt, intro: 0, sx: 0, sy: 0, tx: 0, ty: 0, shown: -1,
    drag: null as null | { x0: number; p0: number; lastX: number; lastT: number; v: number; moved: number; card: number | null; id: number },
    wheel: 0, wheelAt: 0, anims: [] as Animation[], reduce: false, cx: -100, cy: -100, px: -100, py: -100,
  }).current;
  const live = useRef({ items, N, C });
  live.current = { items, N, C };

  // Size and colour start fresh for each piece: M if it's in stock, else the first size that is.
  useEffect(() => {
    const sizes = item.variants.filter((v) => v.available).map((v) => v.size);
    setSize(sizes.includes('M') ? 'M' : sizes[0] ?? null);
    setColor(0);
    const t = thumb.current;
    if (t && !S.reduce) t.animate([{ transform: 'translateY(70%) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }, [item, S]);

  /** Scan the piece onto the model: a line of light sweeps down and leaves the new outfit behind it. */
  const tryOn = useCallback((k: number) => {
    const { items: list } = live.current;
    const next = list[k];
    S.shown = k;
    setCur(k);
    S.anims.forEach((a) => a.cancel());
    S.anims = [];
    const nx = mNext.current, cu = mCur.current, gr = grid.current, sc = scan.current;
    if (!nx || !cu || !gr || !sc) return;
    const url = `url(${next.model})`;
    const done = () => { cu.style.backgroundImage = url; cu.style.visibility = 'visible'; S.anims.forEach((a) => a.cancel()); S.anims = []; };
    const img = new Image();
    img.src = next.model;
    img.decode().catch(() => {}).then(() => {
      if (S.shown !== k) return;            // the shopper has already moved on
      nx.style.backgroundImage = url;
      gr.style.setProperty('--fig', url);
      if (S.reduce) return done();
      const clip = nx.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], { duration: 950, easing: SCAN_EASE, fill: 'forwards' });
      S.anims = [
        clip,
        gr.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)', offset: 0.5 }, { clipPath: 'inset(100% 0 0 0)' }], { duration: 1092, easing: SCAN_EASE, fill: 'forwards' }),
        sc.animate([
          { top: '0%', transform: 'scaleX(.2)', opacity: 0 },
          { top: '6%', transform: 'scaleX(1)', opacity: 1, offset: 0.08 },
          { top: '94%', transform: 'scaleX(1)', opacity: 1, offset: 0.92 },
          { top: '100%', transform: 'scaleX(.2)', opacity: 0 },
        ], { duration: 950, easing: SCAN_EASE, fill: 'forwards' }),
        nx.animate([{ transform: 'scale(1.012)' }, { transform: 'scale(1)' }], { duration: 1250, easing: 'ease-out' }),
      ];
      clip.onfinish = done;
    });
  }, [S]);

  const step = useCallback((d: number) => { S.target = Math.round(S.target) + d; }, [S]);

  // Switching model: the new rail spreads out from the centre again and the first piece scans on.
  const firstSet = useRef(true);
  useEffect(() => {
    if (firstSet.current) { firstSet.current = false; return; }
    S.pos = S.target = 0;
    S.intro = 0;
    S.shown = -1;
  }, [modelKey, S]);

  // Warm the cache with this model's photos, so each scan starts at once.
  useEffect(() => { items.forEach((i) => { const im = new Image(); im.src = i.model; }); }, [items]);

  // The tab pill slides under the active tab.
  useLayoutEffect(() => {
    const place = () => {
      const t = tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      const p = pill.current;
      if (!t || !p) return;
      p.style.width = `${t.offsetWidth}px`;
      p.style.transform = `translateX(${t.offsetLeft - 5}px)`;
    };
    place();
    addEventListener('resize', place);
    return () => removeEventListener('resize', place);
  }, [modelKey]);

  // The frame loop: arc, parallax, settle and cursor.
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    S.reduce = mq.matches;
    setStill(mq.matches);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const seeds = Array.from({ length: 64 }, (_, i) => i * 1.7);
    const letters = ghost.current ? Array.from(ghost.current.children) as HTMLElement[] : [];
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const { N: n, C: c } = live.current;
      const W = innerWidth, H = innerHeight;
      const xs = (W < 768 ? XS_PHONE : XS_DESK).map((v) => v * W);
      S.intro = S.reduce ? 1 : Math.min(1, S.intro + 0.012);
      const ie = 1 - (1 - S.intro) ** 3;
      S.sx += (S.tx - S.sx) * 0.06;
      S.sy += (S.ty - S.sy) * 0.06;
      if (!S.drag) S.pos = S.reduce ? S.target : S.pos + (S.target - S.pos) * 0.11;
      const t = now / 1000;
      for (let i = 0; i < c; i++) {
        const el = cards.current[i];
        if (!el) continue;
        const u = mod(i - S.pos + c / 2, c) - c / 2;
        const a = Math.abs(u), sg = Math.sign(u);
        let s: number, z: number, op: number, ry: number, blur = 0;
        if (a < 1) { s = 0.55 + 0.45 * a; z = -260 * (1 - a); op = a; ry = -sg * 16 * a; }
        else { s = 1 / (1 + 0.3 * (a - 1) ** 1.15); z = -110 * (a - 1); op = 1; ry = -sg * (16 + 9 * Math.min(2, a - 1)); blur = Math.max(0, a - 1.6) * 2.4; }
        if (a > 3.4) op = Math.max(0, 1 - (a - 3.4) / 0.8);
        const bob = S.reduce ? 0 : Math.sin(t * 1.1 + seeds[i % 64]) * H * 0.006 * Math.min(1, a);
        const y = bob - (1 - s) * H * 0.04;
        const x = sg * xAt(xs, a) * ie;
        ry += S.sx * 10;
        const o = op * ie;
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) perspective(1300px) translateZ(${z.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateX(${(-S.sy * 6).toFixed(2)}deg) scale(${(s * (0.6 + 0.4 * ie)).toFixed(4)})`;
        el.style.opacity = o.toFixed(3);
        el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
        el.style.zIndex = String(a < 1 ? 1 : Math.round(100 - 10 * a));
        el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
      }
      if (room.current) room.current.style.transform = `translate3d(${(-S.sx * 22).toFixed(2)}px, ${(-S.sy * 14).toFixed(2)}px, 0) scale(${(1.08 - 0.03 * ie).toFixed(4)})`;
      if (ghost.current) ghost.current.style.transform = `translate(calc(-50% - ${(S.sx * 40).toFixed(2)}px), ${(-S.sy * 16).toFixed(2)}px)`;
      letters.forEach((l, i) => { l.style.transform = `translateY(${((1 - ie) * (60 + 30 * i)).toFixed(1)}px)`; });
      // The rail has come to rest on a piece the model isn't wearing yet: scan it on.
      if (!S.drag && Math.abs(S.target - S.pos) < 0.02) {
        const k = mod(Math.round(S.target), n);
        if (k !== S.shown) tryOn(k);
      }
      const cu = cursor.current;
      if (cu) {
        S.px += (S.cx - S.px) * 0.22;
        S.py += (S.cy - S.py) * 0.22;
        cu.style.transform = `translate(${(S.px - 29).toFixed(1)}px, ${(S.py - 29).toFixed(1)}px)`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); document.body.style.overflow = prevOverflow; S.anims.forEach((a) => a.cancel()); };
  }, [S, tryOn]);

  // Pointer, wheel and keys.
  useEffect(() => {
    const st = stage.current, cu = cursor.current, rt = root.current;
    if (!st || !rt) return;
    const unit = () => (innerWidth < 768 ? XS_PHONE : XS_DESK)[1] * innerWidth;
    const mode = (m: string) => { if (cu) cu.dataset.mode = m; };
    const cardOf = (e: Event) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.vf-card');
      return el ? Number(el.dataset.i) : null;
    };
    const onMove = (e: PointerEvent) => {
      S.tx = e.clientX / innerWidth - 0.5;
      S.ty = e.clientY / innerHeight - 0.5;
      S.cx = e.clientX; S.cy = e.clientY;
      if (S.px < -50) { S.px = e.clientX; S.py = e.clientY; }
      const d = S.drag;
      if (d && e.pointerId === d.id) {
        const dx = e.clientX - d.x0;
        d.moved = Math.max(d.moved, Math.abs(dx));
        S.pos = d.p0 - dx / unit();
        const dt = Math.max(1, e.timeStamp - d.lastT);
        d.v = d.v * 0.4 + ((e.clientX - d.lastX) / dt) * 0.6;
        d.lastX = e.clientX; d.lastT = e.timeStamp;
        mode('drag');
        return;
      }
      const tg = e.target as HTMLElement;
      mode(tg.closest('.vf-card') ? 'try' : tg.closest('button, a, input, select') ? 'btn' : st.contains(tg) ? 'drag' : '');
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      S.drag = { x0: e.clientX, p0: S.pos, lastX: e.clientX, lastT: e.timeStamp, v: 0, moved: 0, card: cardOf(e), id: e.pointerId };
      st.setPointerCapture(e.pointerId);
      cu?.classList.add('down');
    };
    const onUp = (e: PointerEvent) => {
      const d = S.drag;
      cu?.classList.remove('down');
      if (!d || e.pointerId !== d.id) return;
      S.drag = null;
      const { C: c } = live.current;
      if (d.moved < 6) {
        if (d.card !== null) S.target = Math.round(S.pos + (mod(d.card - S.pos + c / 2, c) - c / 2));
        else S.target = Math.round(S.pos);
        return;
      }
      const flick = e.timeStamp - d.lastT > 80 ? 0 : d.v;
      S.target = Math.round(S.pos - flick * 3.2);
    };
    const onWheel = (e: WheelEvent) => {
      S.wheel += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(S.wheel) > 60) {
        if (e.timeStamp - S.wheelAt >= 260) { step(Math.sign(S.wheel)); S.wheelAt = e.timeStamp; }
        S.wheel = 0;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    };
    const onLeave = () => mode('gone');
    rt.addEventListener('pointermove', onMove);
    rt.addEventListener('pointerleave', onLeave);
    st.addEventListener('pointerdown', onDown);
    st.addEventListener('pointerup', onUp);
    st.addEventListener('pointercancel', onUp);
    st.addEventListener('wheel', onWheel, { passive: true });
    addEventListener('keydown', onKey);
    return () => {
      rt.removeEventListener('pointermove', onMove);
      rt.removeEventListener('pointerleave', onLeave);
      st.removeEventListener('pointerdown', onDown);
      st.removeEventListener('pointerup', onUp);
      st.removeEventListener('pointercancel', onUp);
      st.removeEventListener('wheel', onWheel);
      removeEventListener('keydown', onKey);
    };
  }, [S, step]);

  const colorName = item.colors[color]?.[0] ?? item.colors[0]?.[0] ?? '';
  const variantsHere = item.variants.filter((v) => !v.color || !item.colors[color] || v.color === item.colors[color][0] || item.colors.length === 1);
  const variant = variantsHere.find((v) => v.size === size && v.available) ?? null;
  const price = variant?.price ?? item.variants.find((v) => v.available)?.price ?? item.variants[0]?.price ?? 0;
  const deck = useMemo(() => Array.from({ length: C }, (_, i) => items[i % N]), [C, N, items]);

  const addToBag = () => {
    if (!variant) return toast(size ? `${size} is sold out in this piece` : 'Choose your size');
    add({ variantId: variant.id, quantity: 1, handle: item.handle, title: item.title, size: variant.size, color: variant.color, price: variant.price, compareAt: variant.compareAt, image: variant.image ?? item.image });
    setOpen(true);
  };

  return (
    <div className="vf" ref={root}>
      <h1 className="vf-sr">ENRJI Trial Room</h1>
      <div className="vf-room" ref={room} aria-hidden />
      <div className="vf-ghost" ref={ghost} aria-hidden><span>F</span><span>I</span><span>T</span></div>

      <div className="vf-tabs vf-glass" ref={tabs} role="tablist" aria-label="Who's wearing it">
        <span className="vf-pill" ref={pill} aria-hidden />
        {models.map((m) => (
          <button key={m.key} role="tab" aria-selected={m.key === modelKey} onClick={() => setModelKey(m.key)}>{m.label}</button>
        ))}
        <Link href={`/trial-room/photo?product=${item.handle}`} role="tab" aria-selected={false}>Your photo</Link>
      </div>

      <nav className="vf-rail vf-glass" aria-label="Trial Room">
        <Link href="/" aria-label="ENRJI home"><Svg d={Icon.home} /></Link>
        <span className="on" aria-label="Trial Room" aria-current="page"><Svg d={Icon.tee} /></span>
        <Link href={`/products/${item.handle}`} aria-label={`${item.title}: details`}><Svg d={Icon.tag} /></Link>
        <button onClick={() => setOpen(true)} aria-label={`Bag, ${count} item${count === 1 ? '' : 's'}`}>
          <Svg d={Icon.bag} />{count > 0 && <i className="vf-count">{count}</i>}
        </button>
      </nav>

      <div className="vf-stage" ref={stage}>
        <div className="vf-arc" key={modelKey}>
          {deck.map((it, i) => (
            <div
              key={i}
              ref={(el) => { cards.current[i] = el; }}
              className="vf-card vf-glass"
              data-i={i}
              role="button"
              tabIndex={0}
              aria-label={`Try on ${it.title}`}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const c = live.current.C; S.target = Math.round(S.pos + (mod(i - S.pos + c / 2, c) - c / 2)); } }}
              onPointerEnter={(e) => { if (!S.reduce) (e.currentTarget.lastElementChild as HTMLElement)?.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(100%)' }], { duration: 1000, easing: 'cubic-bezier(.2,.8,.2,1)' }); }}
            >
              <img className="vf-g" src={it.garment} alt="" draggable={false} loading={i < 6 ? 'eager' : 'lazy'} />
              <span className="vf-name">{it.name}</span>
              <span className="vf-price">{inr(it.variants.find((v) => v.available)?.price ?? it.variants[0]?.price ?? 0)}</span>
              <span className="vf-sheen" aria-hidden />
            </div>
          ))}
        </div>
      </div>

      <div className="vf-model" aria-hidden>
        <div className="vf-fig" ref={mCur} style={{ visibility: 'hidden' }} />
        <div className="vf-fig vf-next" ref={mNext} />
        <div className="vf-grid" ref={grid} />
        <div className="vf-scan" ref={scan} />
      </div>

      <button className="vf-arrow vf-glass vf-prev" onClick={() => step(-1)} aria-label="Previous piece"><Svg d={Icon.left} size={16} /></button>
      <button className="vf-arrow vf-glass vf-next-btn" onClick={() => step(1)} aria-label="Next piece"><Svg d={Icon.right} size={16} /></button>

      <section className="vf-buy vf-glass" aria-label="This piece">
        <div className="vf-thumb"><div ref={thumb} style={{ backgroundImage: `url(${item.garment})` }} /></div>
        <div className="vf-info">
          <Link href={`/products/${item.handle}`} className="vf-iname"><Roll text={item.title} still={still} /></Link>
          <span className="vf-iprice"><Roll text={inr(price)} still={still} /></span>
        </div>
        <div className="vf-opt vf-opt-size">
          <span className="vf-label">Size</span>
          <div className="vf-sizes">
            {variantsHere.map((v) => (
              <button key={v.id} className="vf-chip" aria-pressed={v.size === size} disabled={!v.available} aria-label={`${v.size}${v.available ? '' : ', sold out'}`} onClick={() => setSize(v.size)}>{v.size}</button>
            ))}
          </div>
        </div>
        <div className="vf-opt vf-opt-colour">
          <span className="vf-label"><Roll text={`Colour · ${colorName}`} still={still} /></span>
          <div className="vf-dots">
            {item.colors.map(([n, hex], i) => (
              <button key={n} className="vf-dot" style={{ background: hex }} aria-pressed={i === color} aria-label={n} onClick={() => setColor(i)} />
            ))}
          </div>
        </div>
        <button className="vf-add" onClick={addToBag} disabled={!item.variants.some((v) => v.available)}>Add to bag</button>
      </section>

      <div className="vf-cur" ref={cursor} data-mode="gone" aria-hidden>
        <span className="vf-ring" />
        <span className="vf-dotc" />
        <b className="vf-t-try">TRY ON</b>
        <b className="vf-t-drag">DRAG</b>
      </div>
    </div>
  );
}
