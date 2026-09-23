import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { counterpart, getProduct, getProducts } from '@/lib/catalogue';
import { cdn, titleCase } from '@/lib/format';
import { SITE_URL } from '@/lib/config';
import { ProductView } from '@/components/BuyBox';
import { lookFor } from '@/lib/garmentData';
import { ProductCard } from '@/components/ProductCard';

export const revalidate = 300;

export async function generateStaticParams() {
  return (await getProducts()).map((p) => ({ handle: p.handle }));
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const p = await getProduct((await params).handle);
  if (!p) return {};
  const description = p.story[0]?.slice(0, 160);
  return {
    title: titleCase(p.title),
    description,
    alternates: { canonical: `/products/${p.handle}` },
    openGraph: { title: `${titleCase(p.title)} · ENRJI®`, description, images: p.images[0] ? [{ url: cdn(p.images[0].src, 1200) }] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const all = await getProducts();
  const p = all.find((x) => x.handle === handle);
  if (!p) notFound();
  const twin = counterpart(all, p);
  const related = all.filter((x) => x.handle !== p.handle && x.handle !== twin?.handle && x.kind === p.kind && x.available).slice(0, 4);

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
  };

  return (
    <div className="container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <ProductView p={p} look={lookFor(p)} twin={twin && { handle: twin.handle, kind: twin.kind, price: twin.price, images: twin.images.slice(0, 1) }} />
      {related.length > 0 && (
        <section className="section tight">
          <div className="section-head"><h2 className="display h3">You may also live by</h2></div>
          <div className="grid">{related.map((r) => <ProductCard key={r.handle} p={r} />)}</div>
        </section>
      )}
    </div>
  );
}
