import { ImageResponse } from 'next/og';
import { asJpeg, Eyebrow, GOLD, INK, IVORY, MUTED, SHARE_SIZE, Wordmark, publicImage, shareFonts } from '@/lib/shareCard';

export const size = SHARE_SIZE;
export const contentType = 'image/jpeg';
export const alt = 'ENRJI: tees and sweatshirts to live by. Tees ₹699, sweatshirts ₹1,099, free shipping across India.';

/** The share picture for every page that doesn't have its own (home, shop, lookbook, story…). */
export default async function Image() {
  const [fonts, a, b] = await Promise.all([shareFonts(), publicImage('store/believe.jpg'), publicImage('store/i-am-energy-sweatshirt.jpg')]);
  return asJpeg(new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: IVORY }}>
        <div style={{ display: 'flex', width: 560, height: '100%', gap: 6 }}>
          {[a, b].map((src, i) => src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" width={277} height={630} style={{ objectFit: 'cover', objectPosition: '50% 18%' }} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, padding: '64px 64px 56px' }}>
          <Wordmark size={40} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Eyebrow>Feel it · Live it</Eyebrow>
            <div style={{ display: 'flex', marginTop: 18, fontFamily: 'Cormorant', fontStyle: 'italic', fontSize: 92, lineHeight: 1, color: INK }}>Wear your energy</div>
            <div style={{ display: 'flex', marginTop: 26, fontFamily: 'Jost', fontSize: 24, lineHeight: 1.45, color: MUTED }}>
              Tees and sweatshirts with words to live by, in 100% combed cotton.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: 'Cormorant', fontSize: 34, color: INK, whiteSpace: 'nowrap' }}>
              <span>Tees ₹699</span>
              <span style={{ color: GOLD }}>·</span>
              <span>Sweatshirts ₹1,099</span>
            </div>
            <div style={{ display: 'flex', fontFamily: 'Jost', fontSize: 20, color: MUTED }}>Free shipping across India</div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  ));
}
