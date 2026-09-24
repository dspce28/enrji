import Link from 'next/link';
import { getProducts, PILLARS, pillarOf, type Pillar, type Product } from '@/lib/catalogue';
import { cdn, srcSet, titleCase } from '@/lib/format';
import { PROMISES } from '@/lib/config';
import { ProductCard } from '@/components/ProductCard';
import { Reveal } from '@/components/Reveal';
import { EditorialHero, type HeroFrame } from '@/components/EditorialHero';
import { EnergyList, type EnergyRow } from '@/components/EnergyList';
import { HomeCinematic } from '@/components/HomeCinematic';
import portraits from '@/data/portraits.json';
import { focus } from '@/lib/focus';

export const revalidate = 300;

const PORTRAITS = portraits as Record<string, { src: string }>;

// Editorial photographs from the store's own product galleries: [product handle, image index].
const HERO: [string, number][][] = [
  [['i-am-energy-sweatshirt', 1], ['be-the-change', 2]],
  [['be-the-change-sweatshirt', 2], ['grateful-gtb-sweatshirt', 1]],
  [['believe', 1], ['mindset-is-everything', 1]],
];

export default async function Home() {
  const products = await getProducts();
  const byHandle = new Map(products.map((p) => [p.handle, p]));
  const img = (handle: string, i = 0) => { const p = byHandle.get(handle); return p?.images[i] ?? p?.images[0] ?? null; };
  const frame = ([h, i]: [string, number]): HeroFrame | null => {
    const p = byHandle.get(h), im = img(h, i);
    return p && im ? { src: im.src, alt: `${titleCase(p.baseName)} ${p.kind === 'tee' ? 'tee' : 'sweatshirt'}, worn`, href: `/products/${p.handle}`, caption: titleCase(p.baseName), style: focus(im.src) } : null;
  };
  const pairs = HERO.map((pair) => pair.map(frame)).filter((pr): pr is [HeroFrame, HeroFrame] => !!pr[0] && !!pr[1]);

  const drop = products.filter((p) => p.tags.includes('live-like-krishna'));
  const edit = products.filter((p) => p.available && !p.limited).sort((a, b) => b.availableCount - a.availableCount).slice(0, 8);
  const pillars: EnergyRow[] = (Object.keys(PILLARS) as Pillar[]).map((k) => {
    const inPillar = products.filter((p) => pillarOf(p) === k);
    const face = inPillar.find((p) => PORTRAITS[p.handle]);
    return { key: k, title: PILLARS[k].title, line: PILLARS[k].line, count: inPillar.length, image: face ? PORTRAITS[face.handle].src : inPillar[0]?.images[0]?.src ?? null, style: focus(face ? PORTRAITS[face.handle].src : inPillar[0]?.images[0]?.src) };
  });
  const dropImg = img('believe', 1);
  const sweatImg = img('healthy-is-new-rich-sweatshirt', 0);   // manifesting-sweatshirt #1 crops the head in the source photo
  const teeImg = img('focus', 0);
  const founder = img('believe', 0);
  const trialImg = img('family-is-my-strength', 1);
  const storeImg = img('money-is-energy', 1);

  return (
    <>
      {pairs.length > 0 && <EditorialHero pairs={pairs} title="Wear your energy" sub="Feel it · Live it" />}
      <HomeCinematic />

      {/* Slides up over the hero as you scroll (see HomeCinematic). */}
      <div className="home-rest">

      <section className="section statement">
        <Reveal className="container statement-inner">
          <p className="eyebrow">ENRJI</p>
          <p className="statement-text">Clothing that carries one idea <em>you have decided to live by.</em></p>
          <p className="lead" style={{ margin: '0 auto' }}>Tees and sweatshirts born from the teachings of Sneh Desai. 100% combed cotton, bio-washed, made to be worn every day.</p>
          <Link href="/our-story" className="link-arrow" style={{ marginTop: 36 }}>Our story <span aria-hidden>→</span></Link>
        </Reveal>
      </section>

      {drop.length > 0 && (
        <section className="section tight">
          <div className="container split">
            <Reveal className="split-media clip-reveal">
              {dropImg && <img src={cdn(dropImg.src, 1200)} srcSet={srcSet(dropImg.src, [600, 900, 1200, 1600])} sizes="(max-width: 900px) 100vw, 55vw" alt="The Believe sweatshirt from the Live Like Krishna edition" loading="lazy" style={focus(dropImg.src)} />}
            </Reveal>
            <Reveal className="split-copy" delay={150}>
              <p className="eyebrow">Limited edition</p>
              <h2 className="display h2" style={{ marginTop: 18 }}>Live Like <em>Krishna</em></h2>
              <p className="lead" style={{ marginTop: 22 }}>The sweatshirts Sneh sir wore on stage at Live Like Krishna, made once, in a small edition for the people who were in the room. Never reprinted.</p>
              <div className="split-cards">
                {drop.slice(0, 2).map((p) => <ProductCard key={p.handle} p={p} sizes="(max-width: 900px) 50vw, 20vw" />)}
              </div>
              <Link href="/collections/limited-edition" className="link-arrow">Discover the edition <span aria-hidden>→</span></Link>
            </Reveal>
          </div>
        </section>
      )}

      <section className="section tight">
        <div className="container tiles">
          {[
            { href: '/collections/sweatshirts', im: sweatImg, title: 'Sweatshirts', line: '250 GSM · Warmth without bulk' },
            { href: '/collections/tees', im: teeImg, title: 'Tees', line: '220 GSM · The everyday essential' },
          ].map((t, n) => (
            <Reveal key={t.href} delay={n * 150}>
              <Link href={t.href} className="tile">
                <div className="tile-media clip-reveal">{t.im && <img src={cdn(t.im.src, 1200)} srcSet={srcSet(t.im.src, [600, 900, 1200])} sizes="(max-width: 760px) 100vw, 50vw" alt="" loading="lazy" style={focus(t.im.src)} />}</div>
                <div className="tile-cap">
                  <h3 className="display h3">{t.title}</h3>
                  <span>{t.line}</span>
                  <span className="link-arrow">Discover <span aria-hidden>→</span></span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="head-centre">
            <p className="eyebrow">The edit</p>
            <h2 className="display h2" style={{ marginTop: 14 }}>Pieces to live in</h2>
          </Reveal>
          <div className="grid edit-grid">
            {edit.map((p, n) => <Reveal key={p.handle} delay={(n % 4) * 90}><ProductCard p={p} priority={false} /></Reveal>)}
          </div>
          <div style={{ textAlign: 'center', marginTop: 56 }}><Link href="/shop" className="btn btn-ghost">View all pieces</Link></div>
        </div>
      </section>

      <section className="section tight energies-section">
        <div className="container">
          <Reveal className="head-centre">
            <p className="eyebrow">Find your ENRJI</p>
            <h2 className="display h2" style={{ marginTop: 14 }}>Four kinds of <em>energy</em></h2>
          </Reveal>
          <EnergyList rows={pillars} />
        </div>
      </section>

      <section className="section">
        <div className="container founder">
          <Reveal className="founder-img clip-reveal">
            {founder && <img src={cdn(founder.src, 1200)} srcSet={srcSet(founder.src, [540, 900, 1200])} sizes="(max-width: 860px) 100vw, 45vw" alt="Sneh Desai at Live Like Krishna" loading="lazy" style={focus(founder.src)} />}
          </Reveal>
          <Reveal delay={150}>
            <p className="eyebrow">From our story</p>
            <blockquote style={{ marginTop: 24 }}>“People rarely fail because they don&apos;t know what to do. They fail because life slowly pulls them away from who they wanted to become.”</blockquote>
            <p className="muted" style={{ marginTop: 28, maxWidth: 480, fontWeight: 300 }}>ENRJI was founded by Sneh Desai after more than two decades of helping millions of people unlock their potential. It exists to keep you close to the person you decided to become.</p>
            <Link href="/our-story" className="link-arrow" style={{ marginTop: 28 }}>Read our story <span aria-hidden>→</span></Link>
          </Reveal>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <Reveal className="head-centre">
            <p className="eyebrow">Only at ENRJI</p>
            <h2 className="display h2" style={{ marginTop: 14 }}>Shop <em>differently</em></h2>
          </Reveal>
          <div className="tiles">
            {[
              { href: '/virtual-store', im: storeImg, title: 'The Virtual Store', line: 'Walk our gallery in 3D and pick anything off the wall.', cta: 'Step inside' },
              { href: '/trial-room', im: trialImg, title: 'The Trial Room', line: 'See a piece on your own photo. Your photo never leaves your phone.', cta: 'Try it on' },
            ].map((t, n) => (
              <Reveal key={t.href} delay={n * 150}>
                <Link href={t.href} className="tile tile-wide">
                  <div className="tile-media clip-reveal">{t.im && <img src={cdn(t.im.src, 1200)} srcSet={srcSet(t.im.src, [600, 900, 1200])} sizes="(max-width: 760px) 100vw, 50vw" alt="" loading="lazy" style={focus(t.im.src)} />}</div>
                  <div className="tile-cap">
                    <h3 className="display h3">{t.title}</h3>
                    <span>{t.line}</span>
                    <span className="link-arrow">{t.cta} <span aria-hidden>→</span></span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <div className="container">
        <div className="trust">
          <div><svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></svg><span><b>{PROMISES.shipping}</b>{PROMISES.delivery}</span></div>
          <div><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg><span><b>Secure checkout</b>{PROMISES.payment}</span></div>
          <div><svg viewBox="0 0 24 24"><path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" /></svg><span><b>Premium fabric</b>100% combed cotton, bio-washed</span></div>
          <div><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg><span><b>Made right</b>Wrong or damaged? We make it right</span></div>
        </div>
      </div>
      </div>
    </>
  );
}
