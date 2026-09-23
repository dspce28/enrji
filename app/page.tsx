import Link from 'next/link';
import { getProducts, PILLARS, pillarOf, type Pillar, type Product } from '@/lib/catalogue';
import { cdn, srcSet, titleCase } from '@/lib/format';
import { PROMISES } from '@/lib/config';
import { ProductCard } from '@/components/ProductCard';
import { Reveal } from '@/components/Reveal';
import { HomeHero3D, type HeroSlide } from '@/components/HomeHero3D';
import { HomeEffects } from '@/components/HomeEffects';
import { Showcase, type ShowcaseItem } from '@/components/Showcase';
import { inr } from '@/lib/format';
import portraits from '@/data/portraits.json';

export const revalidate = 300;

const PORTRAITS = portraits as Record<string, unknown>;
// Hero order: these first when they have a 3D photo, then the rest of the catalogue.
const HERO_FIRST = ['believe', 'i-am-energy', 'selling-is-serving-tee', 'family-is-my-strength', 'health-is-my-new-religion'];

const photo = (products: Product[], handle: string, i = 0) => products.find((p) => p.handle === handle)?.images[i] ?? products[0]?.images[0];

export default async function Home() {
  const products = await getProducts();
  const tees = products.filter((p) => p.kind === 'tee');
  const sweats = products.filter((p) => p.kind === 'sweatshirt' && !p.limited);
  const drop = products.filter((p) => p.tags.includes('live-like-krishna'));
  const slogans = [...new Set(products.map((p) => titleCase(p.baseName)))];
  const hero = photo(products, 'i-am-energy', 0);
  const founder = photo(products, 'believe', 0);
  const trialBg = photo(products, 'selling-is-serving-tee', 0);
  const storeBg = photo(products, 'i-am-energy', 1);
  const pillarCount = (k: Pillar) => products.filter((p) => pillarOf(p) === k).length;
  // One 3D-photo piece per slogan, available first.
  const worn: Product[] = [];
  const seenName = new Set<string>();
  const order = (p: Product) => (p.available ? 0 : 1000) + (HERO_FIRST.indexOf(p.handle) + 1 || 99);
  for (const p of [...products].sort((a, b) => order(a) - order(b))) {
    const key = p.baseName.toLowerCase();
    if (!PORTRAITS[p.handle] || seenName.has(key)) continue;
    seenName.add(key);
    worn.push(p);
  }
  const kindLabel = (p: Product) => (p.limited ? 'Limited edition' : p.kind === 'tee' ? 'Half-sleeve tee' : 'Sweatshirt');
  const slides: HeroSlide[] = worn.slice(0, 5).map((p) => ({ handle: p.handle, name: titleCase(p.baseName), line: [kindLabel(p), pillarOf(p) && PILLARS[pillarOf(p)!].title].filter(Boolean).join(' · '), price: inr(p.price) }));
  const showcase: ShowcaseItem[] = worn.slice(0, 12).map((p) => ({ handle: p.handle, name: titleCase(p.baseName), kind: kindLabel(p), price: inr(p.price) }));

  return (
    <>
      <HomeEffects />
      <section className={`hero${slides.length ? ' hero3d' : ''}`}>
        {slides.length ? <HomeHero3D slides={slides} /> : (
          <div className="hero-media">
            {hero && <img src={cdn(hero.src, 1600)} srcSet={srcSet(hero.src, [720, 1080, 1600, 2000])} sizes="100vw" alt="Sneh Desai on stage wearing the I AM ENERGY tee" fetchPriority="high" />}
          </div>
        )}
        <div className="container hero-content">
          <p className="eyebrow">Feel it · Live it</p>
          <h1 className="display h1 split-in" style={{ marginTop: 18 }}>
            {'Wear your'.split(' ').map((w, i) => <span key={i}><span className="w"><span style={{ animationDelay: `${0.2 + i * 0.12}s` }}>{w}</span></span>{' '}</span>)}
            <span className="w"><span className="gold-text" style={{ animationDelay: '0.44s' }}>energy.</span></span>
          </h1>
          <p className="lead">Tees and sweatshirts born from the teachings of Sneh Desai. Each one carries a single idea you have decided to live by.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/shop" className="btn btn-gold">Shop the collection</Link>
            <Link href="/trial-room" className="btn btn-ghost">Try it on you →</Link>
          </div>
          <div className="hero-meta">
            <div><b>100% combed cotton</b>220 GSM tees · 250 GSM sweatshirts</div>
            <div><b>{PROMISES.shipping}</b>{PROMISES.dispatch}</div>
            <div><b>Bio-washed</b>Soft from the first wear</div>
          </div>
        </div>
        <span className="scroll-cue">Scroll</span>
      </section>

      <div className="marquee" aria-hidden>
        <div className="marquee-track">{[...slogans, ...slogans].map((s, i) => <span key={i}>{s}</span>)}</div>
      </div>

      {showcase.length >= 4 && <Showcase items={showcase} />}

      {drop.length > 0 && (
        <section className="section">
          <div className="container">
            <Reveal className="drop">
              <svg className="feather" viewBox="0 0 100 200" aria-hidden><path d="M50 195 C50 120 50 80 50 10 M50 40 C20 60 15 110 50 150 C85 110 80 60 50 40Z M50 70 C38 80 38 105 50 118 C62 105 62 80 50 70Z" fill="none" stroke="#d9ab52" strokeWidth="1.5" /></svg>
              <div className="drop-inner">
                <div>
                  <p className="eyebrow">Limited edition · Live Like Krishna</p>
                  <h2 className="display h2" style={{ marginTop: 16 }}>Worn on <span className="serif gold">stage.</span><br />Made once.</h2>
                  <p className="lead" style={{ marginTop: 20 }}>The sweatshirts Sneh sir wore at Live Like Krishna, in a small edition for the people who were in the room. Not sold anywhere else. Never reprinted.</p>
                  <Link href="/collections/limited-edition" className="link-arrow" style={{ marginTop: 28 }}>Explore the drop <span aria-hidden>→</span></Link>
                </div>
                <div className="drop-cards">
                  {drop.slice(0, 2).map((p) => <ProductCard key={p.handle} p={p} sizes="(max-width: 900px) 50vw, 25vw" />)}
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      <section className="section tight">
        <div className="container">
          <Reveal className="section-head">
            <div>
              <p className="eyebrow">Find your ENRJI</p>
              <h2 className="display h2" style={{ marginTop: 14 }}>Four kinds <span className="serif">of</span> energy.</h2>
            </div>
            <p className="lead" style={{ maxWidth: 440 }}>Everything around you shapes your mindset, including what you wear. Choose the energy you want to carry today.</p>
          </Reveal>
          <Reveal className="pillars">
            {(Object.keys(PILLARS) as Pillar[]).map((k, i) => (
              <Link key={k} href={`/shop?pillar=${k}`} className="pillar">
                <span className="num">0{i + 1}</span>
                <div>
                  <h3>{PILLARS[k].title}</h3>
                  <p>{PILLARS[k].line}</p>
                  <p style={{ marginTop: 18, color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>{pillarCount(k)} pieces →</p>
                </div>
              </Link>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <Reveal className="section-head">
            <div><p className="eyebrow">Everyday essential</p><h2 className="display h2" style={{ marginTop: 14 }}>The tees</h2></div>
            <Link href="/collections/tees" className="link-arrow">All {tees.length} tees <span aria-hidden>→</span></Link>
          </Reveal>
          <div className="rail">{tees.slice(0, 10).map((p, i) => <ProductCard key={p.handle} p={p} priority={i < 2} sizes="(max-width: 760px) 72vw, 22vw" />)}</div>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <Reveal className="section-head">
            <div><p className="eyebrow">250 GSM · Warmth without bulk</p><h2 className="display h2" style={{ marginTop: 14 }}>Sweatshirts</h2></div>
            <Link href="/collections/sweatshirts" className="link-arrow">All sweatshirts <span aria-hidden>→</span></Link>
          </Reveal>
          <div className="rail">{sweats.slice(0, 10).map((p) => <ProductCard key={p.handle} p={p} sizes="(max-width: 760px) 72vw, 22vw" />)}</div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="section-head">
            <div><p className="eyebrow">Only at ENRJI</p><h2 className="display h2" style={{ marginTop: 14 }}>Shop <span className="serif gold">differently.</span></h2></div>
          </Reveal>
          <div className="experiences">
            <Reveal>
              <Link href="/trial-room" className="exp">
                <div className="exp-bg clip-reveal">{trialBg && <img src={cdn(trialBg.src, 1200)} alt="" loading="lazy" />}</div>
                <span className="scan" aria-hidden />
                <div>
                  <p className="eyebrow">Trial Room</p>
                  <h3 className="display h3" style={{ margin: '12px 0' }}>See it on you before you buy.</h3>
                  <p className="muted" style={{ margin: '0 0 22px', maxWidth: 420 }}>Upload a photo or use your camera. Your photo never leaves your phone.</p>
                  <span className="btn btn-light btn-sm">Enter the trial room</span>
                </div>
              </Link>
            </Reveal>
            <Reveal delay={120}>
              <Link href="/virtual-store" className="exp">
                <div className="exp-bg clip-reveal">{storeBg && <img src={cdn(storeBg.src, 1200)} alt="" loading="lazy" />}</div>
                <span className="grid-floor" aria-hidden />
                <div>
                  <p className="eyebrow">Virtual Store</p>
                  <h3 className="display h3" style={{ margin: '12px 0' }}>Walk the ENRJI store in 3D.</h3>
                  <p className="muted" style={{ margin: '0 0 22px', maxWidth: 420 }}>Step inside, walk the walls, pick up anything that speaks to you.</p>
                  <span className="btn btn-light btn-sm">Step inside</span>
                </div>
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container founder">
          <Reveal className="founder-img clip-reveal">
            {founder && <img src={cdn(founder.src, 1200)} srcSet={srcSet(founder.src, [540, 900, 1200])} sizes="(max-width: 860px) 100vw, 45vw" alt="Sneh Desai at Live Like Krishna" loading="lazy" />}
          </Reveal>
          <Reveal delay={120}>
            <p className="eyebrow">From our story</p>
            <blockquote style={{ marginTop: 20 }}>“People rarely fail because they don&apos;t know what to do. They fail because life slowly pulls them away from who they wanted to become.”</blockquote>
            <p className="muted" style={{ marginTop: 24, maxWidth: 520 }}>ENRJI was founded by Sneh Desai after more than two decades of helping millions of people unlock their potential. It exists to keep you close to the person you decided to become.</p>
            <Link href="/our-story" className="link-arrow" style={{ marginTop: 20 }}>Read our story <span aria-hidden>→</span></Link>
          </Reveal>
        </div>
      </section>

      <div className="container">
        <div className="trust">
          <div><svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></svg><span><b>{PROMISES.shipping}</b>{PROMISES.delivery}</span></div>
          <div><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg><span><b>Secure checkout</b>{PROMISES.payment}</span></div>
          <div><svg viewBox="0 0 24 24"><path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" /></svg><span><b>Premium fabric</b>100% combed cotton, bio-washed</span></div>
          <div><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg><span><b>Wrong or damaged?</b>We make it right — see refund policy</span></div>
        </div>
      </div>
    </>
  );
}
