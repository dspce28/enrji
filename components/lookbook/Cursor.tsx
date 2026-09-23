'use client';

import { useEffect } from 'react';
import gsap from 'gsap';

/** tejint.com's small cursor dot (pointer devices only). */
export function Cursor() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const el = document.getElementById('lb-cursor');
    if (!el) return;
    const x = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3' }), y = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3' });
    const move = (e: PointerEvent) => { x(e.clientX - 6); y(e.clientY - 6); };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  return <div id="lb-cursor" aria-hidden />;
}
