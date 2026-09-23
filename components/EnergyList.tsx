'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { cdn } from '@/lib/format';

export interface EnergyRow { key: string; title: string; line: string; count: number; image: string | null }

/** The four ENRJI energies as an index; hovering a row floats its photograph beside the pointer. */
export function EnergyList({ rows }: { rows: EnergyRow[] }) {
  const [active, setActive] = useState<number | null>(null);
  const float = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });

  const onMove = (e: React.PointerEvent) => {
    const el = float.current;
    if (!el || e.pointerType !== 'mouse') return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pos.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    el.style.transform = `translate3d(${pos.current.x + 40}px, ${pos.current.y - 150}px, 0)`;
  };

  return (
    <div className="energies" onPointerMove={onMove} onPointerLeave={() => setActive(null)}>
      {rows.map((r, n) => (
        <Link key={r.key} href={`/shop?pillar=${r.key}`} className={`energy${active === n ? ' on' : ''}`} onPointerEnter={() => setActive(n)}>
          <span className="energy-num">{String(n + 1).padStart(2, '0')}</span>
          <span className="energy-title">{r.title}</span>
          <span className="energy-line">{r.line}</span>
          <span className="energy-count">{r.count} pieces</span>
        </Link>
      ))}
      <div ref={float} className={`energy-float${active !== null ? ' show' : ''}`} aria-hidden>
        {rows.map((r, n) => r.image && <img key={r.key} src={cdn(r.image, 500)} alt="" className={active === n ? 'on' : ''} loading="lazy" />)}
      </div>
    </div>
  );
}
