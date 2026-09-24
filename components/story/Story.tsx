'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cdn, srcSet } from '@/lib/format';
import { drift, splitWords } from '../HomeCinematic';

export interface StoryImage { src: string; alt: string; style?: React.CSSProperties }

const ENERGIES = [
  ['Mental ENRJI', 'Clear thinking. Continuous learning. Focus.'],
  ['Emotional ENRJI', 'Better relationships. Gratitude. Purpose.'],
  ['Physical ENRJI', 'Strength. Health. Discipline.'],
  ['Spiritual ENRJI', 'Inner peace. Balance. Growth.'],
];
const MOVEMENT = [
  ['Growth', 'Growth is a lifestyle.'],
  ['Excellence', 'Excellence becomes a habit.'],
  ['Discipline', 'Discipline becomes attractive.'],
  ['Environment', 'Create an environment that supports your dreams.'],
];

function Img({ im, sizes, eager = false, className }: { im: StoryImage | null; sizes: string; eager?: boolean; className?: string }) {
  if (!im) return null;
  return <img className={className} src={cdn(im.src, 1200)} srcSet={srcSet(im.src, [540, 900, 1200, 1600])} sizes={sizes} alt={im.alt} style={im.style} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} />;
}

/**
 * Our Story, told like a film: a full-screen opening on stage, a filmstrip of moments that runs sideways as
 * you scroll, words that light up as you read, photographs that open from a window and drift against the
 * scroll, and a closing scene. The words are the brand's own; nothing moves for reduced-motion users.
 */
export function Story({ hero, intro, film, energies, objects, end }: {
  hero: StoryImage | null; intro: StoryImage | null; film: StoryImage[]; energies: StoryImage[]; objects: StoryImage[]; end: StoryImage | null;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current!;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      // Opening (its entrance is CSS, so it plays from the first paint): sinks away as you scroll.
      gsap.to('.st-hero-media', { yPercent: 22, scale: 1.08, ease: 'none', scrollTrigger: { trigger: '.st-hero', start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to('.st-hero-copy', { yPercent: -40, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.st-hero', start: 'top top', end: '70% top', scrub: true } });

      // Words light up as you read.
      for (const t of el.querySelectorAll('[data-words]')) {
        gsap.fromTo(splitWords(t), { opacity: 0.12 }, { opacity: 1, stagger: 0.06, ease: 'none', scrollTrigger: { trigger: t, start: 'top 82%', end: 'bottom 48%', scrub: true } });
      }

      // Photographs open from a window, then drift against the scroll.
      for (const w of el.querySelectorAll<HTMLElement>('[data-open]')) {
        gsap.fromTo(w, { clipPath: 'inset(22% 18% 22% 18%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'power3.out', duration: 1.6, scrollTrigger: { trigger: w, start: 'top 85%' } });
      }
      for (const w of el.querySelectorAll<HTMLElement>('[data-drift]')) drift(w);
      // The folded pieces float at different speeds, like objects at different depths.
      for (const w of el.querySelectorAll<HTMLElement>('[data-float]')) {
        const d = Number(w.dataset.float);
        gsap.fromTo(w, { yPercent: d }, { yPercent: -d, ease: 'none', scrollTrigger: { trigger: '.st-objects', start: 'top bottom', end: 'bottom top', scrub: true } });
      }
      // Text blocks rise into place.
      for (const b of el.querySelectorAll('[data-rise]')) {
        gsap.fromTo(b, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: b, start: 'top 88%' } });
      }

      // The filmstrip: pinned, runs sideways as you scroll down (wide screens; phones swipe it).
      const mm = gsap.matchMedia();
      mm.add('(min-width: 761px)', () => {
        const track = el.querySelector<HTMLElement>('.st-film-track')!;
        const dist = () => track.scrollWidth - window.innerWidth + 64;
        gsap.to(track, {
          x: () => -dist(), ease: 'none',
          scrollTrigger: { trigger: '.st-film', start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: 0.6, invalidateOnRefresh: true },
        });
      });

      // Movement: each word sweeps in and grows as it reaches the centre.
      for (const row of el.querySelectorAll('.st-move-row')) {
        gsap.fromTo(row.querySelector('.st-move-word'), { xPercent: -12, opacity: 0.15 }, { xPercent: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: row, start: 'top 90%', end: 'top 45%', scrub: true } });
        gsap.fromTo(row.querySelector('.st-move-line'), { opacity: 0, x: 40 }, { opacity: 1, x: 0, ease: 'none', scrollTrigger: { trigger: row, start: 'top 80%', end: 'top 50%', scrub: true } });
      }

      // Closing scene: the photograph zooms out behind the words.
      gsap.fromTo('.st-end-media img', { scale: 1.25 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.st-end', start: 'top bottom', end: 'bottom bottom', scrub: true } });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <div className="story" ref={root}>
      {/* 1 · Opening */}
      <section className="st-hero">
        <div className="st-hero-media"><Img im={hero} sizes="100vw" eager /></div>
        <div className="st-hero-copy">
          <p className="eyebrow st-fade">Our story</p>
          <h1 className="st-title">
            <span className="st-line"><span>Every day,</span></span>
            <span className="st-line"><span>you make <em>hundreds</em></span></span>
            <span className="st-line"><span>of choices.</span></span>
          </h1>
          <p className="st-hero-sub st-fade">Before you step into the world you decide what to think, how to act, where to focus and who to become.</p>
        </div>
        <div className="st-scroll st-fade" aria-hidden><span>Scroll</span><i /></div>
      </section>

      {/* 2 · What surrounds you */}
      <section className="st-intro">
        <div className="st-intro-copy">
          <p className="st-big" data-words>One of those choices is something most people never question: what you wear, what you carry, what surrounds you.</p>
          <div className="st-prose" data-rise>
            <h2>Everything around you shapes your mindset</h2>
            <p>Your environment. Your habits. Your conversations. The books you read, the music you listen to, the people you spend time with. And yes, the products you choose every single day.</p>
          </div>
        </div>
        <div className="st-intro-media" data-open data-drift><Img im={intro} sizes="(max-width: 900px) 100vw, 42vw" /></div>
      </section>

      {/* 3 · Filmstrip */}
      <section className="st-film" aria-label="Born from transformation">
        <div className="st-film-track">
          <div className="st-film-intro">
            <p className="eyebrow">Born from transformation</p>
            <h2 className="st-h2">More than two decades of helping millions of people unlock their potential.</h2>
            <p className="st-muted">Seminars, books, coaching programmes and transformational experiences.</p>
          </div>
          {film.map((im, i) => (
            <figure key={i} className={`st-frame${i % 2 ? ' low' : ''}`}>
              <Img im={im} sizes="(max-width: 760px) 78vw, 30vw" />
              <figcaption>{String(i + 1).padStart(2, '0')}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* 4 · The realisation */}
      <section className="st-quote">
        <p className="eyebrow">Over the years, one realisation kept appearing</p>
        <p className="st-quote-text" data-words>People rarely fail because they don&apos;t know what to do. They fail because life slowly pulls them away from who they wanted to become.</p>
        <p className="st-quote-after" data-rise>Goals get forgotten. Standards begin to drop. Distractions take over. The environment wins. <b>That&apos;s why ENRJI was created.</b></p>
      </section>

      {/* 5 · Four kinds of energy */}
      <section className="st-energies">
        <div className="st-energies-head" data-rise>
          <p className="eyebrow">Why ENRJI exists</p>
          <h2 className="st-h2">The quality of your energy decides the quality of your life.</h2>
        </div>
        {ENERGIES.map(([t, l], i) => (
          <div key={t} className={`st-energy${i % 2 ? ' flip' : ''}`}>
            <div className="st-energy-media" data-open data-drift><Img im={energies[i] ?? null} sizes="(max-width: 900px) 100vw, 40vw" /></div>
            <div className="st-energy-copy" data-rise>
              <span className="st-num">0{i + 1}</span>
              <h3>{t}</h3>
              <p>{l}</p>
            </div>
          </div>
        ))}
        <p className="st-big st-centre" data-words>Everything we create exists to protect, elevate and remind you of that energy. Simple.</p>
      </section>

      {/* 6 · Objects */}
      <section className="st-objects">
        {objects.map((im, i) => (
          <div key={i} className={`st-object o${i}`} data-open data-float={String([12, 30, 20][i] ?? 15)}><Img im={im} sizes="(max-width: 760px) 70vw, 30vw" /></div>
        ))}
      </section>

      {/* 7 · The movement */}
      <section className="st-move">
        <p className="eyebrow">This is the ENRJI movement</p>
        {MOVEMENT.map(([t, l]) => (
          <div key={t} className="st-move-row">
            <span className="st-move-word">{t}</span>
            <span className="st-move-line">{l}</span>
          </div>
        ))}
      </section>

      {/* 8 · Closing */}
      <section className="st-end">
        <div className="st-end-media"><Img im={end} sizes="100vw" /></div>
        <div className="st-end-copy" data-rise>
          <p className="st-end-quote">“Every product you own should either elevate your life… or it shouldn&apos;t be there.”</p>
          <Link href="/shop" className="btn btn-light">Choose your ENRJI</Link>
        </div>
      </section>
    </div>
  );
}
