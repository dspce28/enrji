'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cdn, srcSet } from '@/lib/format';

export interface HeroFrame { src: string; alt: string; href: string; caption: string }

const HOLD = 6500;

/**
 * Editorial hero: two portrait photographs side by side (one on phones). Each change opens the next
 * pair from a small centred window to full frame — the slow "hop" reveal — while the previous pair settles back.
 */
export function EditorialHero({ pairs, title, sub }: { pairs: [HeroFrame, HeroFrame][]; title: string; sub: string }) {
  const [i, setI] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);

  useEffect(() => {
    if (pairs.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => go((i + 1) % pairs.length), HOLD);
    return () => clearTimeout(t);
  });

  function go(n: number) {
    if (n === i) return;
    setPrev(i);
    setI(n);
  }

  return (
    <section className="ehero" aria-roledescription="carousel" aria-label="ENRJI, worn">
      <div className="ehero-stage">
        {pairs.map((pair, n) => (
          <div key={n} className={`ehero-slide${n === i ? ' on' : ''}${n === prev ? ' off' : ''}`} aria-hidden={n !== i}
            onAnimationEnd={() => { if (n === i) setPrev(null); }}>
            {pair.map((f, k) => (
              <Link key={k} href={f.href} className="ehero-frame" tabIndex={n === i ? 0 : -1}>
                <img src={cdn(f.src, 1200)} srcSet={srcSet(f.src, [600, 900, 1200, 1600])} sizes="(max-width: 760px) 100vw, 50vw" alt={f.alt}
                  loading="eager" fetchPriority={n === 0 ? 'high' : 'low'} />
                <span className="ehero-cap">{f.caption}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="ehero-copy">
        <p className="ehero-sub">{sub}</p>
        <h1 className="ehero-title">{title}</h1>
        <div className="ehero-links">
          <Link href="/collections/sweatshirts">Sweatshirts</Link>
          <Link href="/collections/tees">Tees</Link>
          <Link href="/lookbook">Lookbook</Link>
        </div>
      </div>
      {pairs.length > 1 && (
        <div className="ehero-nav">
          <button aria-label="Previous" onClick={() => go((i - 1 + pairs.length) % pairs.length)}>←</button>
          <span>{String(i + 1).padStart(2, '0')} <i /> {String(pairs.length).padStart(2, '0')}</span>
          <button aria-label="Next" onClick={() => go((i + 1) % pairs.length)}>→</button>
        </div>
      )}
    </section>
  );
}
