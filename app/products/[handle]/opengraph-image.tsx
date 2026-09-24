import { ImageResponse } from 'next/og';
import { getProduct } from '@/lib/catalogue';
import { cdn, inr, titleCase } from '@/lib/format';
import { PROMISES } from '@/lib/config';
import { asJpeg, Eyebrow, GOLD, INK, IVORY, MUTED, SHARE_SIZE, Wordmark, publicImage, shareFonts } from '@/lib/shareCard';
import portraits from '@/data/portraits.json';

export const size = SHARE_SIZE;
export const contentType = 'image/jpeg';
export const alt = 'An ENRJI tee or sweatshirt, worn';
export const revalidate = 3600;

const PORTRAITS = portraits as Record<string, { src: string }>;

/** The share picture for a product: the piece worn, its name and price. */
export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [fonts, p] = await Promise.all([shareFonts(), getProduct(handle)]);
  // Our own cropped model photo if there is one, else the store's first photo.
  const photo = (PORTRAITS[handle] && await publicImage(`store/${handle}.jpg`)) || (p?.images[0] ? cdn(p.images[0].src, 800) : null);
  const kind = p?.kind === 'tee' ? 'Half-sleeve tee' : 'Sweatshirt';
  return asJpeg(new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: IVORY }}>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" width={472} height={630} style={{ objectFit: 'cover', objectPosition: '50% 18%' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, padding: '64px 72px 56px' }}>
          <Wordmark size={34} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Eyebrow>{p?.limited ? `Limited edition · ${kind}` : kind}</Eyebrow>
            <div style={{ display: 'flex', marginTop: 20, fontFamily: 'Cormorant', fontStyle: 'italic', fontSize: (p?.baseName.length ?? 0) > 22 ? 70 : 88, lineHeight: 1.02, color: INK }}>
              {p ? titleCase(p.baseName) : 'ENRJI'}
            </div>
            {p && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 28, fontFamily: 'Cormorant', fontSize: 44, color: INK }}>
                <span>{inr(p.price)}</span>
                {p.compareAt && p.compareAt > p.price && <span style={{ fontSize: 30, color: MUTED, textDecoration: 'line-through' }}>{inr(p.compareAt)}</span>}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'Jost', fontSize: 22, color: MUTED }}>
            <span>100% combed cotton</span>
            <span style={{ color: GOLD }}>·</span>
            <span>{PROMISES.shipping}</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  ));
}
