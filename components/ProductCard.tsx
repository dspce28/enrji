import Link from 'next/link';
import type { Product } from '@/lib/catalogue';
import { cdn, srcSet, titleCase } from '@/lib/format';
import { Price } from './Price';
import { Stars } from './Stars';
import flats from '@/data/garment-photos.json';

const FLAT = flats as Record<string, { color: string; card?: boolean }>;
/** Our own files, resized by Next's image optimiser. */
const local = (src: string, w: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;

export function ProductCard({ p, priority = false, rating, sizes = '(max-width: 760px) 50vw, (max-width: 1100px) 33vw, 25vw' }: { p: Product; priority?: boolean; rating?: { average: number; count: number }; sizes?: string }) {
  // The worn photo leads; on hover, the garment on its hanger, cut out on the page's ivory
  // (public/garments, made by scripts/garment-cutouts.py), or the next photo when there's no cut-out.
  const flat = FLAT[p.handle] && FLAT[p.handle].card !== false ? `/garments/${p.handle}.jpg` : null;
  const [a, b] = [p.images[0], flat ? null : p.images[1]];
  const lowStock = p.available && p.availableCount <= 2;
  return (
    <Link href={`/products/${p.handle}`} className={`card${p.available ? '' : ' soldout'}`}>
      <div className="card-media">
        <div className="card-flags">
          {p.limited && <span className="chip chip-gold">Limited edition</span>}
          {!p.available && <span className="chip chip-out">Sold out</span>}
          {lowStock && <span className="chip">Few sizes left</span>}
        </div>
        {a && <img src={cdn(a.src, 720)} srcSet={srcSet(a.src)} sizes={sizes} alt={titleCase(p.title)} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} />}
        {flat && <span className="card-flat"><img src={local(flat, 640)} srcSet={[384, 640, 828].map((w) => `${local(flat, w)} ${w}w`).join(', ')} sizes={sizes} alt="" loading="lazy" /></span>}
        {b && <img className="alt" src={cdn(b.src, 720)} srcSet={srcSet(b.src)} sizes={sizes} alt="" loading="lazy" />}
        {p.available && <span className="card-quick btn btn-light btn-sm btn-block">View & choose size</span>}
      </div>
      <div className="card-info">
        <div>
          <div className="card-title">{titleCase(p.baseName)}</div>
          <div className="card-kind">{p.kind === 'tee' ? 'Half-sleeve tee' : 'Sweatshirt'}{p.colors.length > 1 ? ` · ${p.colors.length} colours` : ''}</div>
        </div>
        <Price price={p.price} compareAt={p.compareAt} />
      </div>
      {rating && <div className="card-rating" aria-label={`Rated ${rating.average.toFixed(1)} out of 5 by ${rating.count} customers`}><Stars value={rating.average} size={11} label={false} /><span>{rating.average.toFixed(1)} ({rating.count})</span></div>}
    </Link>
  );
}
