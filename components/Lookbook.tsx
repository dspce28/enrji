'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cdn, srcSet } from '@/lib/format';

export interface Look { handle: string; src: string; name: string; kind: string; price: string; available: boolean }

const pad = (n: number) => String(n).padStart(2, '0');

/** Title that rises in letter by letter; re-keyed on every change so it replays. */
function Split({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={`split ${className ?? ''}`} aria-label={text}>
      {text.split(' ').map((w, wi, all) => (
        <span key={wi} className="split-w" aria-hidden>
          {w.split('').map((c, ci) => <span key={ci} style={{ animationDelay: `${delay + (wi * 4 + ci) * 0.028}s` }}>{c}</span>)}
          {wi < all.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}

/**
 * Lookbook, after tejint.com's studio:
 * - a full-screen horizontal gallery moved by scroll wheel, drag or swipe, with each photograph
 *   drifting inside its frame (parallax) and an index of names along the bottom;
 * - tap a photograph to open the viewer, where each change opens the next image from a small
 *   centred window to full frame, and the name rises in letter by letter.
 */
export function Lookbook({ looks }: { looks: Look[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [view, setView] = useState<{ i: number; prev: number | null } | null>(null);
  const api = useRef<{ goTo(i: number): void } | null>(null);

  // ---------- horizontal gallery ----------
  useEffect(() => {
    const w = wrap.current!, t = track.current!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let target = 0, current = 0, max = 0, raf = 0, last = -1;
    const slides = () => [...t.children] as HTMLElement[];
    const measure = () => { max = Math.max(0, t.scrollWidth - w.clientWidth); target = Math.min(target, max); };
    const clamp = (v: number) => Math.max(0, Math.min(max, v));

    const onWheel = (e: WheelEvent) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      // Let the page scroll on once the gallery has reached either end.
      if ((d > 0 && target >= max - 1) || (d < 0 && target <= 1)) return;
      e.preventDefault();
      target = clamp(target + d * 1.1);
    };
    let drag: { x: number; y: number; start: number; moved: number; horizontal: boolean | null } | null = null;
    const onDown = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, start: target, moved: 0, horizontal: e.pointerType === 'mouse' ? true : null }; };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.horizontal === null && Math.hypot(dx, dy) > 8) drag.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!drag.horizontal) return;
      drag.moved = Math.max(drag.moved, Math.abs(dx));
      target = clamp(drag.start - dx * 1.4);
      if (drag.moved > 6) w.classList.add('dragging');
    };
    const onUp = () => { setTimeout(() => w.classList.remove('dragging'), 0); dragged = (drag?.moved ?? 0) > 6; drag = null; };
    let dragged = false;
    const onClickCapture = (e: MouseEvent) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } };

    const tick = () => {
      current += (target - current) * (reduce ? 1 : 0.085);
      if (Math.abs(target - current) < 0.05) current = target;
      t.style.transform = `translate3d(${-current}px, 0, 0)`;
      const mid = w.clientWidth / 2;
      let best = 0, bestD = Infinity;
      slides().forEach((s, n) => {
        const r = s.getBoundingClientRect();
        const c = r.left + r.width / 2 - w.getBoundingClientRect().left;
        const img = s.querySelector('img');
        if (img && !reduce) img.style.transform = `translate3d(${(c - mid) / w.clientWidth * -14}%, 0, 0) scale(1.28)`;
        const d = Math.abs(c - mid);
        if (d < bestD) { bestD = d; best = n; }
      });
      if (best !== last) { last = best; setActive(best); }
      w.style.setProperty('--p', String(max ? current / max : 0));
      raf = requestAnimationFrame(tick);
    };
    api.current = {
      goTo: (i) => {
        const s = slides()[i];
        if (s) target = clamp(s.offsetLeft + s.offsetWidth / 2 - w.clientWidth / 2);
      },
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(w); ro.observe(t);
    w.addEventListener('wheel', onWheel, { passive: false });
    w.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    w.addEventListener('click', onClickCapture, true);
    tick();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      w.removeEventListener('wheel', onWheel);
      w.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      w.removeEventListener('click', onClickCapture, true);
    };
  }, [looks]);

  // ---------- viewer ----------
  const open = (i: number) => setView({ i, prev: null });
  const go = useCallback((dir: 1 | -1) => setView((v) => v && { i: (v.i + dir + looks.length) % looks.length, prev: v.i }), [looks.length]);
  const close = useCallback(() => setView((v) => { if (v) api.current?.goTo(v.i); return null; }), []);

  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.documentElement.style.overflow = ''; };
  }, [view, go, close]);

  const swipe = useRef<number | null>(null);
  const cur = looks[active];
  const v = view ? looks[view.i] : null;

  return (
    <>
      <section ref={wrap} className="lb" aria-label="Lookbook">
        <div className="lb-top container">
          <div>
            <p className="eyebrow">Lookbook · The collection, worn</p>
            {cur && <h1 key={active} className="lb-title"><Split text={cur.name} /></h1>}
          </div>
          <div className="lb-count"><span key={active} className="lb-count-n">{pad(active + 1)}</span><i /> {pad(looks.length)}</div>
        </div>

        <div ref={track} className="lb-track">
          {looks.map((l, n) => (
            <button key={`${l.handle}-${n}`} className={`lb-slide${n === active ? ' on' : ''}`} onClick={() => open(n)} aria-label={`View ${l.name}`}>
              <span className="lb-frame">
                <img src={cdn(l.src, 900)} srcSet={srcSet(l.src, [500, 700, 900, 1200])} sizes="(max-width: 760px) 70vw, 30vw" alt={`${l.name} ${l.kind.toLowerCase()}, worn`} draggable={false} loading={n < 5 ? 'eager' : 'lazy'} />
              </span>
              <span className="lb-cap"><em>{pad(n + 1)}</em> {l.name}</span>
            </button>
          ))}
        </div>

        <div className="lb-bottom container">
          <nav className="lb-index" aria-label="Looks">
            {[...new Map(looks.map((l, n) => [l.name, n])).entries()].map(([name]) => {
              const first = looks.findIndex((l) => l.name === name);
              return <button key={name} className={looks[active]?.name === name ? 'on' : ''} onClick={() => api.current?.goTo(first)}>{name}</button>;
            })}
          </nav>
          <div className="lb-bar"><i /></div>
          <p className="lb-hint">Scroll or drag to browse · tap a look to open it</p>
        </div>
      </section>

      <div className={`lbv${view ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="Look viewer" aria-hidden={!view}
        onPointerDown={(e) => { swipe.current = e.clientX; }}
        onPointerUp={(e) => { if (swipe.current !== null && Math.abs(e.clientX - swipe.current) > 60) go(e.clientX < swipe.current ? 1 : -1); swipe.current = null; }}>
        {view && (
          <>
            <div className="lbv-stage">
              {looks.map((l, n) => (n === view.i || n === view.prev) && (
                <div key={n} className={`lbv-img${n === view.i ? ' on' : ' off'}`}>
                  <img src={cdn(l.src, 1400)} srcSet={srcSet(l.src, [700, 1000, 1400, 1800])} sizes="(max-width: 760px) 100vw, 45vw" alt={`${l.name}, worn`} draggable={false} />
                </div>
              ))}
            </div>
            {v && (
              <div className="lbv-info" key={view.i}>
                <p className="lbv-kicker">{v.kind}</p>
                <h2 className="lbv-title"><Split text={v.name} delay={0.35} /></h2>
                <p className="lbv-price">{v.price}</p>
                <Link href={`/products/${v.handle}`} className="btn btn-light">{v.available ? 'Shop this piece' : 'View piece'}</Link>
              </div>
            )}
            <div className="lbv-nav">
              <button onClick={() => go(-1)} aria-label="Previous look">←</button>
              <span>{pad(view.i + 1)} <i /> {pad(looks.length)}</span>
              <button onClick={() => go(1)} aria-label="Next look">→</button>
            </div>
            <button className="lbv-close" onClick={close} aria-label="Close">Close <span aria-hidden>✕</span></button>
          </>
        )}
      </div>
    </>
  );
}
