'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { cdn, srcSet } from '@/lib/format';
import { FlairButton } from './FlairButton';
import { Cursor } from './Cursor';

export interface StudioLook { handle: string; src: string; name: string }

/**
 * The Lookbook studio, built to the same behaviour as tejint.com/studio:
 * a full-screen row of photographs that the scroll wheel (or a swipe) glides sideways with easing;
 * each photograph is sized by where it sits on screen — shrinking to half size as it travels left
 * of centre, growing to 1.75× and spreading apart to the right — over a faint fabric ground,
 * with a vertical sidebar along the left edge.
 */
export function Studio({ looks }: { looks: StudioLook[] }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const target = useRef(880);   // tejint opens part-way along the row
  const current = useRef(0);

  useEffect(() => {
    const w = wrapper.current!;
    const slides = [...w.children] as HTMLElement[];
    const maxX = () => w.offsetWidth - window.innerWidth;
    const clamp = (v: number) => Math.min(Math.max(0, v), maxX());
    let raf = 0;

    const layout = () => {
      const vw = window.innerWidth;
      // tejint's values on laptops and up; on phones the growth and spread are scaled to the screen.
      const k = Math.min(1, vw / 1100), maxScale = 1 + 0.75 * k;
      for (const s of slides) {
        const r = s.getBoundingClientRect();
        const n = (r.left + r.right) / 2 - vw / 2;
        let scale = 1, x = 0;
        if (n > 0) { scale = Math.min(maxScale, 1 + n / vw); x = (scale - 1) * 300 * k; }
        else scale = Math.max(0.5, 1 - Math.abs(n) / vw);
        gsap.set(s, { scale, x });
      }
    };
    const tick = () => {
      current.current += (target.current - current.current) * 0.075;
      gsap.set(w, { x: -current.current });
      layout();
      raf = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => { target.current = clamp(target.current); };
    const onWheel = (e: WheelEvent) => { target.current = clamp(target.current + e.deltaY + e.deltaX); };
    let touchX = 0;
    const onTouchStart = (e: TouchEvent) => { touchX = e.touches[0].clientX; };
    const onTouchMove = (e: TouchEvent) => {
      const x = e.touches[0].clientX;
      target.current = clamp(target.current + (touchX - x));
      touchX = x;
    };
    // Mouse drag as well, for trackpads without horizontal scroll.
    let drag: number | null = null;
    const onDown = (e: MouseEvent) => { drag = e.clientX; };
    const onMove = (e: MouseEvent) => { if (drag === null) return; target.current = clamp(target.current + (drag - e.clientX) * 1.5); drag = e.clientX; };
    const onUp = () => { drag = null; };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') target.current = clamp(target.current + 446);
      if (e.key === 'ArrowLeft') target.current = clamp(target.current - 446);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [looks]);

  return (
    <div className="studio">
      <img className="studio-noise" src="/lookbook/fabric.jpg" alt="" aria-hidden />
      <div className="studio-sidebar">
        <div className="studio-sidebar-items">
          <Link href="/" className="studio-logo">
            <span className="studio-logo-mark">ENRJI</span>
            <span className="studio-logo-sub">Feel it · Live it</span>
          </Link>
          <FlairButton href="/shop">Shop the collection <span aria-hidden>↑</span></FlairButton>
          <FlairButton href="/lookbook/energies" flair="flair-gold">Four <em>Energies</em></FlairButton>
        </div>
      </div>
      <div ref={wrapper} className="studio-wrapper" aria-label="Lookbook">
        {looks.map((l, i) => (
          <Link key={i} href={`/products/${l.handle}`} className="studio-slide" draggable={false} aria-label={l.name}
            onClick={(e) => { if (Math.abs(target.current - current.current) > 30) e.preventDefault(); }}>
            <img src={cdn(l.src, 900)} srcSet={srcSet(l.src, [480, 720, 960, 1280])} sizes="(max-width: 760px) 220px, 612px" alt={`${l.name}, worn`} draggable={false} loading={i < 5 ? 'eager' : 'lazy'} />
            <span className="studio-slide-name">{l.name} <b>· Shop</b></span>
          </Link>
        ))}
      </div>
      <Cursor />
    </div>
  );
}
