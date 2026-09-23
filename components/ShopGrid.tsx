'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Product, Pillar } from '@/lib/catalogue';
import { ProductCard } from './ProductCard';

export interface ShopItem { p: Product; pillar: Pillar | null }

const PILLAR_LABELS: Record<Pillar, string> = { mental: 'Mental', emotional: 'Emotional', physical: 'Physical', spiritual: 'Spiritual' };

export function ShopGrid({ items, fixedKind }: { items: ShopItem[]; fixedKind?: 'tee' | 'sweatshirt' }) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const kind = fixedKind ?? (params.get('kind') as 'tee' | 'sweatshirt' | null);
  const pillar = params.get('pillar') as Pillar | null;
  const sort = params.get('sort') ?? 'featured';
  const inStock = params.get('stock') === '1';

  const set = (key: string, value: string | null) => {
    const q = new URLSearchParams(params.toString());
    if (value) q.set(key, value); else q.delete(key);
    router.replace(`${path}${q.size ? `?${q}` : ''}`, { scroll: false });
  };

  const shown = useMemo(() => {
    let list = items.filter(({ p, pillar: pl }) => (!kind || p.kind === kind) && (!pillar || pl === pillar) && (!inStock || p.available));
    if (sort === 'price-asc') list = [...list].sort((a, b) => a.p.price - b.p.price);
    if (sort === 'price-desc') list = [...list].sort((a, b) => b.p.price - a.p.price);
    if (sort === 'new') list = [...list].sort((a, b) => b.p.createdAt.localeCompare(a.p.createdAt));
    return list;
  }, [items, kind, pillar, sort, inStock]);

  return (
    <>
      <div className="filters" role="toolbar" aria-label="Filter products">
        {!fixedKind && (
          <>
            <button className="pill" aria-pressed={!kind} onClick={() => set('kind', null)}>All</button>
            <button className="pill" aria-pressed={kind === 'tee'} onClick={() => set('kind', 'tee')}>Tees</button>
            <button className="pill" aria-pressed={kind === 'sweatshirt'} onClick={() => set('kind', 'sweatshirt')}>Sweatshirts</button>
            <span style={{ width: 1, height: 24, background: 'var(--line-2)', margin: '0 6px' }} />
          </>
        )}
        {(Object.keys(PILLAR_LABELS) as Pillar[]).map((k) => (
          <button key={k} className="pill" aria-pressed={pillar === k} onClick={() => set('pillar', pillar === k ? null : k)}>{PILLAR_LABELS[k]}</button>
        ))}
        <button className="pill" aria-pressed={inStock} onClick={() => set('stock', inStock ? null : '1')}>In stock</button>
        <select className="select" value={sort} onChange={(e) => set('sort', e.target.value === 'featured' ? null : e.target.value)} aria-label="Sort">
          <option value="featured">Featured</option>
          <option value="new">Newest</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </select>
      </div>
      <p className="count-note">{shown.length} {shown.length === 1 ? 'piece' : 'pieces'}</p>
      {shown.length ? (
        <div className="grid" style={{ marginTop: 16 }}>{shown.map(({ p }, i) => <ProductCard key={p.handle} p={p} priority={i < 4} />)}</div>
      ) : (
        <div className="empty">Nothing matches those filters. <button className="link-arrow" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => router.replace(path)}>Clear filters</button></div>
      )}
    </>
  );
}
