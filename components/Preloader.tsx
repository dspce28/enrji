'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { WORDMARK } from '@/lib/wordmarkPaths';

const BARS = 10;

/**
 * The opening curtain, after tejint.com: ten ink bars cover the screen while the ENRJI mark draws itself in
 * a fine white line; the mark fades, the bars lift away one after another, and the page's own entrance plays.
 *
 * Shown once per visit (sessionStorage), never to reduced-motion users, and never without JavaScript:
 * PRELOAD_SCRIPT (run in <head>, before the first paint) decides, by setting html.preloading.
 */
export const PRELOAD_SCRIPT = `try{var d=document.documentElement;if(!sessionStorage.getItem('enrji-intro')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)d.classList.add('preloading')}catch(e){}`;

export function Preloader() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains('preloading')) return;
    const done = () => {
      html.classList.remove('preloading');
      try { sessionStorage.setItem('enrji-intro', '1'); } catch { /* private mode: it just plays again */ }
    };
    const el = root.current!;
    // The mark starts drawing (CSS) at first paint, which on a real connection can be a second or more after
    // navigation starts. Hold it for at least 2.3 s from that paint (fully drawn by ~1.9 s, then a beat),
    // and at least 0.6 s more even when JavaScript arrives late.
    const paint = performance.getEntriesByName('first-paint')[0]?.startTime ?? performance.now();
    const hold = Math.max(0.6, 2.3 - (performance.now() - paint) / 1000);
    const tl = gsap.timeline({ onComplete: done })
      .to(el.querySelector('.pl-mark'), { delay: hold, duration: 0.8, opacity: 0, y: -12, ease: 'power2.in' })
      .to(el.querySelectorAll('.pl-bar'), { duration: 0.9, height: 0, ease: 'power4.inOut', stagger: { each: 0.045, from: 'start' } }, '+=0.15')
      // Let the page's entrance start as the curtain lifts, not after it.
      .add(() => html.classList.add('preload-lifting'), '-=0.6');
    // Never leave anyone behind a curtain: bail out if something stalls.
    const failsafe = setTimeout(() => { tl.progress(1); }, 6000);
    return () => { clearTimeout(failsafe); tl.kill(); };
  }, []);

  return (
    <div className="preloader" ref={root} aria-hidden>
      <div className="pl-bars">{Array.from({ length: BARS }, (_, i) => <div key={i} className="pl-bar" />)}</div>
      <div className="pl-mark">
        <svg className="pl-ring" viewBox="0 0 220 220">
          <circle cx="110" cy="110" r="108" pathLength={1} />
          {/* The E of the wordmark, centred in the ring. */}
          <g transform="translate(59 172) scale(0.2)"><path d={WORDMARK.paths[0]} pathLength={1} /></g>
        </svg>
        <svg className="pl-word" viewBox={WORDMARK.viewBox}>
          {WORDMARK.paths.map((d, i) => <path key={i} d={d} pathLength={1} style={{ animationDelay: `${0.2 + i * 0.1}s` }} />)}
        </svg>
      </div>
    </div>
  );
}
