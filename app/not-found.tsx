import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div>
        <p className="eyebrow">404</p>
        <h1 className="display h2" style={{ margin: '14px 0 20px' }}>Wrong turn. <span className="serif gold">Same energy.</span></h1>
        <Link href="/shop" className="btn btn-gold">Back to the collection</Link>
      </div>
    </div>
  );
}
