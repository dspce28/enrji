'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';

/**
 * Outline pill whose fill (the "flair") grows from where the pointer enters, follows it,
 * and shrinks out where it leaves — tejint.com's animated button.
 */
export function FlairButton({ href, children, className = '', flair = '' }: { href: string; children: ReactNode; className?: string; flair?: string }) {
  const btn = useRef<HTMLAnchorElement>(null);
  const fl = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const b = btn.current, f = fl.current;
    if (!b || !f) return;
    const setX = gsap.quickSetter(f, 'xPercent'), setY = gsap.quickSetter(f, 'yPercent');
    const at = (e: MouseEvent) => {
      const r = b.getBoundingClientRect();
      const x = gsap.utils.clamp(0, 100, gsap.utils.mapRange(0, r.width, 0, 100, e.clientX - r.left));
      const y = gsap.utils.clamp(0, 100, gsap.utils.mapRange(0, r.height, 0, 100, e.clientY - r.top));
      return { x, y };
    };
    const enter = (e: MouseEvent) => {
      const { x, y } = at(e);
      setX(x); setY(y);
      gsap.to(f, { scale: 1, duration: 1, ease: 'power2.out' });
      gsap.to('#lb-cursor', { opacity: 0, duration: 0.2 });
    };
    const leave = (e: MouseEvent) => {
      const { x, y } = at(e);
      gsap.killTweensOf(f);
      gsap.to(f, { xPercent: x > 90 ? x + 20 : x < 10 ? x - 20 : x, yPercent: y > 90 ? y + 20 : y < 10 ? y - 20 : y, scale: 0, duration: 0.3, ease: 'power2.out' });
      gsap.to('#lb-cursor', { opacity: 1, duration: 0.4 });
    };
    const move = (e: MouseEvent) => { const { x, y } = at(e); gsap.to(f, { xPercent: x, yPercent: y, duration: 0.4, ease: 'power2' }); };
    b.addEventListener('mouseenter', enter);
    b.addEventListener('mouseleave', leave);
    b.addEventListener('mousemove', move);
    return () => { b.removeEventListener('mouseenter', enter); b.removeEventListener('mouseleave', leave); b.removeEventListener('mousemove', move); };
  }, []);
  return (
    <Link ref={btn} href={href} className={`flair-btn ${className}`}>
      <span ref={fl} className={`flair-btn-flair ${flair}`} aria-hidden />
      <span className="flair-btn-label">{children}</span>
    </Link>
  );
}
