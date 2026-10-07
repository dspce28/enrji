import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { counterpart, getProduct, getProducts, PILLARS, pillarOf, type Product } from '@/lib/catalogue';
import { cdn, titleCase } from '@/lib/format';
import { SITE_URL } from '@/lib/config';
import { ProductView } from '@/components/BuyBox';
import { lookFor } from '@/lib/garmentData';
import { ProductCard } from '@/components/ProductCard';
import { Reviews } from '@/components/Reviews';
import { ratingsByHandle, reviewsEnabled, reviewsFor, summarise } from '@/lib/reviews';

export const revalidate = 300;

export async function generateStaticParams() {
  return (await getProducts()).map((p) => ({ handle: p.handle }));
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const p = await getProduct((await params).handle);
  if (!p) return {};
  const description = p.seoDescription || p.story[0]?.slice(0, 160);
  return {
    title: p.seoTitle || titleCase(p.title),
    description,
    alternates: { canonical: `/products/${p.handle}` },
    // The share picture comes from ./opengraph-image.tsx.
    openGraph: { title: `${titleCase(p.title)} · ENRJI®`, description },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const all = await getProducts();
  const p = all.find((x) => x.handle === handle);
  if (!p) notFound();
  const twin = counterpart(all, p);
  const pillar = pillarOf(p);
  const pairing = pairFor(all, p, twin);
  const related = all.filter((x) => x.handle !== p.handle && x.handle !== twin?.handle && x.handle !== pairing?.handle && x.kind === p.kind && x.available).slice(0, 4);
  const [reviews, ratings] = await Promise.all([reviewsFor(p.handle), ratingsByHandle()]);
  const summary = summarise(reviews);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: titleCase(p.title),
    description: p.story.join(' '),
    image: p.images.slice(0, 4).map((i) => cdn(i.src, 1200)),
    brand: { '@type': 'Brand', name: 'ENRJI' },
    offers: p.variants.map((v) => ({
      '@type': 'Offer',
      url: `${SITE_URL}/products/${p.handle}`,
      priceCurrency: 'INR',
      price: v.price,
      availability: v.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      name: [v.color, v.size].filter(Boolean).join(' / '),
    })),
    // Real, published reviews only (from Judge.me): search engines show these as stars.
    ...(summary && {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: summary.average.toFixed(1), reviewCount: summary.count, bestRating: 5, worstRating: 1 },
      review: reviews.slice(0, 5).map((r) => ({
        '@type': 'Review', author: { '@type': 'Person', name: r.name }, datePublished: r.date.slice(0, 10),
        reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 }, name: r.title || undefined, reviewBody: r.body,
      })),
    }),
  };

  return (
    <div className="container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <ProductView p={p} look={lookFor(p)} twin={twin && { handle: twin.handle, kind: twin.kind, price: twin.price, images: twin.images.slice(0, 1) }} rating={summary && { average: summary.average, count: summary.count }} pillar={pillar} pairing={pairing} />
      <section className="slogan-band" data-energy={pillar ?? undefined} aria-label={pillar ? PILLARS[pillar].title : 'Live Like Krishna'}>
        <p className="heavy slogan-word" aria-hidden>{p.baseName}</p>
        <div className="slogan-caption">
          <span>{pillar ? <><b>{PILLARS[pillar].title}</b> · {PILLARS[pillar].line}</> : p.limited ? <><b>Live Like Krishna</b> · Limited edition, never reprinted.</> : <b>Wear your energy</b>}</span>
          <Link href={pillar ? `/shop?pillar=${pillar}` : p.limited ? '/collections/limited-edition' : '/shop'} className="link-arrow">{pillar ? `Shop ${PILLARS[pillar].name.toLowerCase()} energy` : 'Shop the collection'} →</Link>
        </div>
      </section>
      {reviewsEnabled && <Reviews handle={p.handle} reviews={reviews} summary={summary} />}
      {related.length > 0 && (
        <section className="section tight">
          <div className="section-head"><h2 className="display h3">You may also live by</h2></div>
          <div className="grid">{related.map((r) => <ProductCard key={r.handle} p={r} rating={ratings[r.handle]} />)}</div>
        </section>
      )}
    </div>
  );
}

/**
 * "Complete the look": a piece from the same energy in the other garment (a tee goes with a sweatshirt), else
 * the same garment in the same energy. Never the same slogan; that's already offered as "Also available as".
 */
function pairFor(all: Product[], p: Product, twin: Product | null): Product | null {
  const pillar = pillarOf(p);
  if (!pillar) return null;
  const ok = (x: Product) => x.available && x.handle !== p.handle && x.handle !== twin?.handle
    && x.baseName.toLowerCase() !== p.baseName.toLowerCase() && pillarOf(x) === pillar;
  return all.find((x) => ok(x) && x.kind !== p.kind) ?? all.find((x) => ok(x)) ?? null;
}
