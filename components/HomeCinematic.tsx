'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/** Wrap each word of an element's text in a span, keeping inline markup such as <em>. */
export function splitWords(el: Element) {
  const words: HTMLElement[] = [];
  const walk = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of (child.textContent ?? '').split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
          const s = document.createElement('span');
          s.className = 'sw';
          s.textContent = part;
          words.push(s);
          frag.appendChild(s);
        }
        child.replaceWith(frag);
      } else walk(child);
    }
  };
  walk(el);
  return words;
}

/**
 * Let a framed photograph drift against the scroll (parallax). The photo is scaled up 10% about its centre and
 * slides within that margin, so no edge ever shows. Photos whose face sits near the top edge (see lib/focus.ts)
 * stay still: sliding them would crop the head.
 */
export function drift(frame: HTMLElement, amount = 5) {
  const img = frame.querySelector('img');
  if (!img) return;
  const y = parseFloat((img.style.objectPosition || '50% 50%').split(' ')[1]);
  if (!Number.isNaN(y) && y < 15) return;
  img.classList.add('drift');
  gsap.fromTo(frame, { '--py': `${-amount}%` }, { '--py': `${amount}%`, ease: 'none', scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true } });
}

/**
 * Scroll effects for the home page:
 * - the page slides up over the hero like a curtain while the hero sinks back and dims;
 * - the brand statement lights up word by word as you read down;
 * - photographs drift a little slower than the page (parallax).
 * Nothing moves for people who ask their device for reduced motion.
 */
export function HomeCinematic() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const hero = document.querySelector<HTMLElement>('.ehero');
      const header = document.querySelector<HTMLElement>('.header');
      if (hero) {
        ScrollTrigger.create({ trigger: hero, start: () => `top ${header?.offsetHeight ?? 0}px`, end: 'bottom top', pin: true, pinSpacing: false });
        const sink = { trigger: hero, start: () => `top ${header?.offsetHeight ?? 0}px`, end: 'bottom top', scrub: true };
        gsap.to(hero.querySelector('.ehero-stage'), { scale: 0.9, yPercent: 6, ease: 'none', scrollTrigger: sink });
        gsap.to(hero.querySelector('.ehero-shade'), { opacity: 0.7, ease: 'none', scrollTrigger: sink });
        gsap.to(hero.querySelector('.ehero-copy'), { y: -120, opacity: 0, ease: 'none', scrollTrigger: { ...sink, end: '55% top' } });
      }

      const statement = document.querySelector('.statement-text');
      if (statement) {
        gsap.fromTo(splitWords(statement), { opacity: 0.14 }, {
          opacity: 1, stagger: 0.08, ease: 'none',
          scrollTrigger: { trigger: statement, start: 'top 85%', end: 'bottom 50%', scrub: true },
        });
      }

      for (const el of document.querySelectorAll<HTMLElement>('.split-media, .tile-media, .founder-img')) drift(el);
    });
    return () => ctx.revert();
  }, []);
  return null;
}
