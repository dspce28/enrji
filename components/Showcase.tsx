'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

export interface ShowcaseItem { handle: string; name: string; kind: string; price: string }

/**
 * "Worn by" gallery: the section pins while you scroll and the portraits travel sideways,
 * each photo drifting inside its frame for depth (tejint-style horizontal slider).
 */
export function Showcase({ items }: { items: ShowcaseItem[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const w = wrap.current!, t = track.current!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const size = () => {
      // Height of the pinned section = horizontal distance to travel + one screen.
      const travel = Math.max(0, t.scrollWidth - window.innerWidth);
      w.style.height = reduce ? 'auto' : `${travel + window.innerHeight}px`;
    };
    const update = () => {
      raf = 0;
      if (reduce) return;
      const r = w.getBoundingClientRect();
      const travel = Math.max(0, t.scrollWidth - window.innerWidth);
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      t.style.transform = `translate3d(${-travel * p}px, 0, 0)`;
      t.querySelectorAll<HTMLElement>('.showcase-card img').forEach((img) => {
        const b = img.parentElement!.getBoundingClientRect();
        const c = (b.left + b.width / 2) / window.innerWidth - 0.5;
        img.style.transform = `translate3d(${c * -12}%, 0, 0) scale(1.25)`;
      });
      w.style.setProperty('--progress', String(p));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    size(); update();
    window.addEventListener('scroll', onScroll, { passive: true });
    const onResize = () => { size(); update(); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); };
  }, [items]);

  return (
    <section ref={wrap} className="showcase" aria-label="The collection, worn">
      <div className="showcase-pin">
        <div className="showcase-head container">
          <p className="eyebrow">The collection, worn</p>
          <h2 className="display h2">Real people. <span className="serif gold">Real energy.</span></h2>
        </div>
        <div ref={track} className="showcase-track">
          {items.map((it, i) => (
            <Link key={it.handle} href={`/products/${it.handle}`} className="showcase-card">
              <div className="showcase-media"><img src={`/store/${it.handle}.jpg`} alt={`${it.name} ${it.kind}`} loading="lazy" /></div>
              <div className="showcase-info">
                <span className="showcase-num">{String(i + 1).padStart(2, '0')}</span>
                <div><b>{it.name}</b><span>{it.kind} · {it.price}</span></div>
              </div>
            </Link>
          ))}
        </div>
        <div className="showcase-bar"><i /></div>
      </div>
    </section>
  );
}
