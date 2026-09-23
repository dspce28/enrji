import type { Metadata } from 'next';
import Link from 'next/link';
import { TEE_SIZES } from '@/lib/sizes';

export const metadata: Metadata = { title: 'Size guide', description: 'ENRJI tee measurements and fit advice.' };

export default function SizeGuide() {
  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">Fit</p>
        <h1 className="display h1" style={{ marginTop: 14 }}>Size guide</h1>
        <p className="lead" style={{ marginTop: 18 }}>All ENRJI pieces are a unisex regular fit. If you&apos;re between sizes, or you like a relaxed drape, go one size up.</p>
      </header>
      <div className="prose">
        <h2 style={{ marginTop: 0 }}>Half-sleeve tees</h2>
        <table className="size-table" style={{ fontSize: 16 }}>
          <thead><tr><th>Size</th><th>Chest (in)</th><th>Length (in)</th></tr></thead>
          <tbody>{TEE_SIZES.map((s) => <tr key={s.size}><td>{s.size}</td><td>{s.chest}</td><td>{s.length}</td></tr>)}</tbody>
        </table>
        <p style={{ fontSize: 15, color: 'var(--muted)', marginTop: 12 }}>Measured flat across the garment; chest is the full circumference.</p>
        <h2>How to measure</h2>
        <p>Lay a tee that fits you well flat on a table. Measure straight across the chest just below the sleeves and double it. Measure length from the highest point of the shoulder to the hem. Compare with the table above.</p>
        <h2>Sweatshirts</h2>
        <p>Sweatshirts are 250 GSM combed cotton in the same unisex regular fit, S to 3XL. The Live Like Krishna edition has a relaxed fit, so go one size up if you&apos;re between sizes. Need exact measurements? <Link href="/contact" style={{ textDecoration: 'underline' }}>Ask us</Link> and we&apos;ll measure one for you.</p>
      </div>
    </div>
  );
}
