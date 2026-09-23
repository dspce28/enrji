import type { Metadata } from 'next';
import Link from 'next/link';
import { getProduct } from '@/lib/catalogue';
import { cdn } from '@/lib/format';
import { Reveal } from '@/components/Reveal';

export const revalidate = 3600;
export const metadata: Metadata = { title: 'Our Story', description: 'ENRJI was founded by Sneh Desai to keep you close to the person you decided to become.' };

const PILLARS = [
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

export default async function OurStory() {
  const img = (await getProduct('surrender-smile-rise'))?.images[0] ?? (await getProduct('i-am-energy'))?.images[0];
  return (
    <>
      <div className="container">
        <header className="page-head">
          <p className="eyebrow">Our story</p>
          <h1 className="display h1" style={{ marginTop: 14, maxWidth: '14ch' }}>Every day, you make <span className="serif gold">hundreds</span> of choices.</h1>
        </header>
        <div className="founder" style={{ alignItems: 'start' }}>
          <Reveal className="founder-img">{img && <img src={cdn(img.src, 1200)} alt="Sneh Desai on stage" />}</Reveal>
          <Reveal className="prose" delay={100}>
            <p>Before you step into the world you decide what to think, how to act, where to focus and who to become. One of those choices is something most people never question: what you wear, what you carry, what surrounds you.</p>
            <h2>Everything around you shapes your mindset</h2>
            <p>Your environment. Your habits. Your conversations. The books you read, the music you listen to, the people you spend time with. And yes, the products you choose every single day.</p>
            <h2>Born from transformation</h2>
            <p>ENRJI was founded by Sneh Desai after more than two decades of helping millions of people unlock their potential through seminars, books, coaching programmes and transformational experiences.</p>
            <p>Over the years one realisation kept appearing. People rarely fail because they don&apos;t know what to do. They fail because life slowly pulls them away from who they wanted to become. Goals get forgotten. Standards begin to drop. Distractions take over. The environment wins.</p>
            <p><b style={{ color: 'var(--text)' }}>That&apos;s why ENRJI was created.</b></p>
          </Reveal>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <Reveal className="section-head"><div><p className="eyebrow">Why ENRJI exists</p><h2 className="display h2" style={{ marginTop: 14 }}>The quality of your energy decides the quality of your life.</h2></div></Reveal>
          <Reveal className="pillars">
            {PILLARS.map(([t, l], i) => (
              <div key={t} className="pillar"><span className="num">0{i + 1}</span><div><h3>{t}</h3><p>{l}</p></div></div>
            ))}
          </Reveal>
          <p className="lead" style={{ marginTop: 32 }}>Everything we create exists to protect, elevate and remind you of that energy. Simple.</p>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <Reveal><p className="eyebrow">This is the ENRJI movement</p></Reveal>
          <div style={{ marginTop: 28 }}>
            {MOVEMENT.map(([t, l], i) => (
              <Reveal key={t} delay={i * 60} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'baseline', borderTop: '1px solid var(--line)', padding: '28px 0', flexWrap: 'wrap' }}>
                <span className="display h2">{t}</span>
                <span className="serif" style={{ fontSize: 'clamp(22px, 2.4vw, 32px)', color: 'var(--muted)' }}>{l}</span>
              </Reveal>
            ))}
          </div>
          <Reveal style={{ marginTop: 60, textAlign: 'center' }}>
            <p className="serif" style={{ fontSize: 'clamp(28px, 3.4vw, 48px)', maxWidth: 900, margin: '0 auto' }}>“Every product you own should either elevate your life… or it shouldn&apos;t be there.”</p>
            <Link href="/shop" className="btn btn-gold" style={{ marginTop: 36 }}>Choose your ENRJI</Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
