'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { Img } from '@/lib/catalogue';
import { cdn, srcSet } from '@/lib/format';
import type { GarmentKind } from '@/lib/garment';
import { resolveLook, type GarmentLook } from '@/lib/look';

const Garment360 = dynamic(() => import('./Garment360'), { ssr: false, loading: () => <div className="g360"><div className="g360-loading"><span /></div></div> });

export function Gallery({ images, color, title, kind, slogan, look }: { images: Img[]; color: string | null; title: string; kind: GarmentKind; slogan: string; look: GarmentLook }) {
  const [view, setView] = useState<'photos' | '360'>('photos');
  const resolved = resolveLook(look, color);
  // Colour-specific shots first when a colour is selected, then everything else.
  const ordered = color
    ? [...images.filter((i) => i.colors.includes(color)), ...images.filter((i) => !i.colors.includes(color))]
    : images;
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => setIdx(0), [color]);
  const cur = ordered[idx] ?? ordered[0];
  if (!cur) return <div className="gallery-main" />;

  return (
    <div className="gallery">
      <div className="gallery-thumbs" role="tablist" aria-label="Product photos">
        {ordered.map((im, i) => (
          <button key={im.src} role="tab" aria-current={i === idx} aria-label={`Photo ${i + 1}`} onClick={() => setIdx(i)}>
            <img src={cdn(im.src, 180)} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
      <div className="view-toggle" role="group" aria-label="View">
        <button aria-pressed={view === 'photos'} onClick={() => setView('photos')}>Photos</button>
        <button aria-pressed={view === '360'} onClick={() => setView('360')}>360° view</button>
      </div>
      {view === '360' ? (
        <div className="gallery-main" style={{ cursor: 'default' }}>
          <Garment360 kind={kind} color={resolved.color} ink={look.ink} slogan={slogan} artwork={resolved.artwork} />
        </div>
      ) : (
      <div
        className={`gallery-main${zoom ? ' zoom' : ''}`}
        onClick={(e) => {
          if (zoom) return setZoom(null);
          const r = e.currentTarget.getBoundingClientRect();
          setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
        }}
        onMouseMove={(e) => {
          if (!zoom) return;
          const r = e.currentTarget.getBoundingClientRect();
          setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
        }}
        onMouseLeave={() => setZoom(null)}
      >
        <img
          key={cur.src}
          src={cdn(cur.src, 1200)}
          srcSet={srcSet(cur.src, [540, 800, 1200, 1600])}
          sizes="(max-width: 960px) 100vw, 55vw"
          alt={`${title} — photo ${idx + 1}`}
          style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
          fetchPriority={idx === 0 ? 'high' : undefined}
        />
      </div>
      )}
      </div>
    </div>
  );
}
