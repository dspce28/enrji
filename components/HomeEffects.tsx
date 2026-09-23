'use client';

import { useEffect } from 'react';

/**
 * Page-level polish for the home page, all progressive (the page works without it):
 * - a gold cursor ring that grows over anything clickable (mouse/trackpad only);
 * - product cards tilt toward the pointer with a moving sheen;
 * - buttons lean magnetically toward the pointer;
 * - `.clip-reveal` images open from a centred window when scrolled into view.
 */
export function HomeEffects() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const cleanups: (() => void)[] = [];

    // Clip reveals.
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -12% 0px' });
    document.querySelectorAll('.clip-reveal').forEach((el) => io.observe(el));
    cleanups.push(() => io.disconnect());

    if (fine && !reduce) {
      // Cursor.
      const ring = document.createElement('div');
      ring.className = 'cursor-ring';
      const dot = document.createElement('div');
      dot.className = 'cursor-dot';
      document.body.append(ring, dot);
      document.documentElement.classList.add('has-cursor');
      let x = -100, y = -100, rx = -100, ry = -100, raf = 0;
      const onMove = (e: PointerEvent) => {
        x = e.clientX; y = e.clientY;
        const hot = (e.target as Element | null)?.closest?.('a, button, [role="button"], input, label, .card');
        ring.classList.toggle('hot', !!hot);
      };
      const onDown = () => ring.classList.add('down');
      const onUp = () => ring.classList.remove('down');
      const tick = () => {
        rx += (x - rx) * 0.18; ry += (y - ry) * 0.18;
        ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
        dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        raf = requestAnimationFrame(tick);
      };
      tick();
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onDown);
      window.addEventListener('pointerup', onUp);
      cleanups.push(() => {
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        ring.remove(); dot.remove();
        document.documentElement.classList.remove('has-cursor');
      });

      // Card tilt + sheen, and magnetic buttons (event delegation, so rails added later work too).
      let tilted: HTMLElement | null = null, magnet: HTMLElement | null = null;
      const onOver = (e: PointerEvent) => {
        const card = (e.target as Element).closest?.('.rail .card, .drop-cards .card, .showcase-card') as HTMLElement | null;
        if (tilted && tilted !== card) { tilted.style.transform = ''; tilted.style.removeProperty('--sx'); }
        tilted = card;
        if (card) {
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
          card.style.transform = `perspective(900px) rotateY(${px * 10}deg) rotateX(${-py * 8}deg) translateZ(0)`;
          card.style.setProperty('--sx', `${(px + 0.5) * 100}%`);
          card.style.setProperty('--sy', `${(py + 0.5) * 100}%`);
        }
        const btn = (e.target as Element).closest?.('.btn') as HTMLElement | null;
        if (magnet && magnet !== btn) magnet.style.transform = '';
        magnet = btn;
        if (btn) {
          const r = btn.getBoundingClientRect();
          btn.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.25}px)`;
        }
      };
      const onLeave = () => { if (tilted) tilted.style.transform = ''; if (magnet) magnet.style.transform = ''; tilted = magnet = null; };
      document.addEventListener('pointermove', onOver, { passive: true });
      document.addEventListener('pointerleave', onLeave);
      cleanups.push(() => { document.removeEventListener('pointermove', onOver); document.removeEventListener('pointerleave', onLeave); onLeave(); });
    }
    return () => cleanups.forEach((c) => c());
  }, []);
  return null;
}
