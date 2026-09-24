'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { cdn } from '@/lib/format';
import { FlairButton } from './FlairButton';
import { HomeButton } from './HomeButton';
import { Cursor } from './Cursor';

gsap.registerPlugin(CustomEase);

export interface EnergySlide { key: string; name: string; line: string; img: string; count: number }

const CLIP = { closed: 'polygon(25% 30%, 75% 30%, 75% 70%, 25% 70%)', open: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' };
const POS = (mobile: boolean) => ({
  prev: { left: mobile ? '-50%' : '15%', top: '50%', rotation: -90, scale: 1, opacity: 1 },
  active: { left: '50%', top: '50%', rotation: 0, scale: 1, opacity: 1 },
  next: { left: mobile ? '150%' : '85%', top: '50%', rotation: 90, scale: 1, opacity: 1 },
  prevIn: { left: mobile ? '-50%' : '15%', top: '50%', rotation: -90, scale: 0, opacity: 0 },
  nextIn: { left: mobile ? '150%' : '85%', top: '50%', rotation: 90, scale: 0, opacity: 0 },
});

/** Split a heading into characters for the swap animation. */
function chars(text: string) {
  return text.split(' ').map((w, i) => (
    <span key={i} className="en-word">{w.split('').map((c, j) => <span key={j} className="en-char">{c}</span>)}</span>
  ));
}

/**
 * The four ENRJI energies, built to the same behaviour as tejint.com's home carousel:
 * the current energy as a tall card in the centre; the previous and next ones turned 90° and
 * cropped to a small window either side; a large, slowly breathing preview of the photograph
 * behind; on change every card swings to its new place with the "hop" ease while the title's
 * letters drop out and the new name drops in.
 */
export function Energies({ slides }: { slides: EnergySlide[] }) {
  const router = useRouter();
  const n = slides.length;
  const [active, setActive] = useState(1 % n);
  const [preview, setPreview] = useState(slides[1 % n]?.img ?? slides[0]?.img);
  const busy = useRef(false);
  const cards = useRef<HTMLDivElement[]>([]);
  const titleBox = useRef<HTMLDivElement>(null);
  const previewImg = useRef<HTMLImageElement>(null);
  const pos = useRef(POS(false));
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    CustomEase.create('hop', 'M0,0 C0.488,0.02 0.467,0.286 0.5,0.5 0.532,0.712 0.58,1 1,1');
    const place = () => {
      pos.current = POS(window.innerWidth < 768);
      const P = pos.current, a = activeRef.current;
      cards.current.forEach((c, i) => {
        const rel = ((i - a) % n + n) % n;
        if (rel === 0) gsap.set(c, { ...P.active, clipPath: CLIP.open });
        else if (rel === 1) gsap.set(c, { ...P.next, clipPath: CLIP.closed });
        else if (rel === n - 1) gsap.set(c, { ...P.prev, clipPath: CLIP.closed });
        else gsap.set(c, { ...P.nextIn, clipPath: CLIP.closed });
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [n]);

  function go(target: number) {
    const cur = activeRef.current;
    if (busy.current || target === cur) return;
    busy.current = true;
    const forward = (target - cur + n) % n <= n / 2;   // step one place toward the target, as tejint does
    const C = forward ? (cur + 1) % n : (cur - 1 + n) % n;
    setActive(C);
    const P = pos.current;
    const at = (k: number) => cards.current[((k % n) + n) % n];
    const c = at(C), prev = at(C - 1), next = at(C + 1);

    // Title: old letters drop away, new ones drop in from above.
    const box = titleBox.current!;
    const old = box.querySelector('h2');
    const fresh = document.createElement('h2');
    fresh.innerHTML = slides[C].name.split(' ').map((w) => `<span class="en-word">${[...w].map((ch) => `<span class="en-char">${ch}</span>`).join('')}</span>`).join('');
    box.appendChild(fresh);
    gsap.timeline({ onComplete: () => old?.remove(), defaults: { stagger: { amount: 0.2 }, ease: 'power4.inOut' } })
      .to(old ? old.querySelectorAll('.en-char') : [], { yPercent: 100 })
      .fromTo(fresh.querySelectorAll('.en-char'), { yPercent: -100 }, { yPercent: 0 });

    // Preview behind: fade out, swap, fade in.
    gsap.timeline({ defaults: { ease: 'power4.inOut' } })
      .to(previewImg.current, { opacity: 0, duration: 1, onComplete: () => setPreview(slides[C].img) })
      .to(previewImg.current, { opacity: 1, duration: 1, delay: 0.1 });

    // Cards swing into place. The card that will become the new neighbour starts hidden on the side it enters from.
    const incoming = forward ? next : prev;
    if (n > 3) gsap.set(incoming, forward ? { ...P.nextIn, clipPath: CLIP.closed } : { ...P.prevIn, clipPath: CLIP.closed });
    const tl = gsap.timeline({ defaults: { duration: 2, ease: 'hop' }, onComplete: () => { busy.current = false; } });
    tl.to(c, { ...P.active, clipPath: CLIP.open }, 0)
      .to(prev, { ...P.prev, clipPath: CLIP.closed }, 0)
      .to(next, { ...P.next, clipPath: CLIP.closed }, 0);
    for (let k = 0; k < n; k++) {
      const el = cards.current[k];
      if (el === c || el === prev || el === next) continue;
      tl.to(el, { ...(forward ? P.prevIn : P.nextIn), clipPath: CLIP.closed }, 0);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go((activeRef.current + 1) % n);
      if (e.key === 'ArrowLeft') go((activeRef.current - 1 + n) % n);
    };
    window.addEventListener('keydown', onKey);
    let sx: number | null = null;
    const ts = (e: TouchEvent) => { sx = e.touches[0].clientX; };
    const te = (e: TouchEvent) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) go(((activeRef.current + (dx < 0 ? 1 : -1)) % n + n) % n);
      sx = null;
    };
    window.addEventListener('touchstart', ts, { passive: true });
    window.addEventListener('touchend', te);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('touchstart', ts); window.removeEventListener('touchend', te); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  const cur = slides[active];
  return (
    <div className="en">
      <header className="en-head">
        <Link href="/" className="en-logo" aria-label="ENRJI home">
          <span className="en-logo-ring">E</span>
          <span className="en-logo-word">ENRJI</span>
        </Link>
        <div className="en-head-actions">
          <FlairButton href="/lookbook">Lookbook</FlairButton>
          <HomeButton />
        </div>
      </header>

      <button className="en-arrow en-left" onClick={() => go((active - 1 + n) % n)} aria-label="Previous energy">
        <svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
      </button>
      <button className="en-arrow en-right" onClick={() => go((active + 1) % n)} aria-label="Next energy">
        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>

      <div className="en-slider">
        {slides.map((s, i) => (
          <div key={s.key} ref={(el) => { if (el) cards.current[i] = el; }} className="en-card"
            onClick={() => (i === active ? router.push(`/shop?pillar=${s.key}`) : go(i))}
            role="button" tabIndex={0} aria-label={i === active ? `Shop ${s.name}` : `Show ${s.name}`}>
            <div className="en-card-img"><img src={cdn(s.img, 1000)} alt="" draggable={false} /></div>
          </div>
        ))}

        <div className="en-title" ref={titleBox} aria-live="polite">
          <h2>{chars(slides[1 % n]?.name ?? '')}</h2>
        </div>
        {cur && <Link className="en-shop" key={active} href={`/shop?pillar=${cur.key}`}>{cur.line} <b>Shop {cur.count} pieces →</b></Link>}

        <div className="en-counter"><span>{active + 1}</span><span>/</span><span>{n}</span></div>
        <div className="en-items">
          {slides.map((s, i) => <button key={s.key} className={i === active ? 'on' : ''} onClick={() => go(i)}>{s.name}</button>)}
        </div>
        <div className="en-preview" aria-hidden><img ref={previewImg} src={preview ? cdn(preview, 1600) : undefined} alt="" /></div>
      </div>
      <Cursor />
    </div>
  );
}
