import type { Review, RatingSummary } from '@/lib/reviews';
import { Stars } from './Stars';
import { ReviewForm } from './ReviewForm';

const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Product-page reviews: the summary, the reviews, and a form to add one. */
export function Reviews({ handle, reviews, summary }: { handle: string; reviews: Review[]; summary: RatingSummary | null }) {
  return (
    <section className="section tight reviews" id="reviews" aria-labelledby="reviews-title">
      <div className="reviews-head">
        <div>
          <p className="eyebrow">From people who wear it</p>
          <h2 id="reviews-title" className="display h3" style={{ marginTop: 10 }}>Reviews</h2>
        </div>
        {summary && (
          <div className="reviews-summary">
            <div className="reviews-avg">
              <b>{summary.average.toFixed(1)}</b>
              <Stars value={summary.average} size={16} />
              <span>{summary.count} review{summary.count === 1 ? '' : 's'}</span>
            </div>
            <ul className="reviews-bars" aria-label="Ratings breakdown">
              {[5, 4, 3, 2, 1].map((n) => (
                <li key={n}>
                  <span>{n}★</span>
                  <i><i style={{ width: `${(summary.stars[n - 1] / summary.count) * 100}%` }} /></i>
                  <span>{summary.stars[n - 1]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {reviews.length === 0 && <p className="lead" style={{ marginTop: 18 }}>No reviews yet. Bought this piece? Tell others how it fits and feels.</p>}
      <ol className="reviews-list">
        {reviews.slice(0, 12).map((r) => (
          <li key={r.id}>
            <div className="review-meta">
              <Stars value={r.rating} />
              <span className="review-name">{r.name}</span>
              {r.verified && <span className="review-verified">Verified buyer</span>}
              <time dateTime={r.date}>{date(r.date)}</time>
            </div>
            {r.title && <h3 className="review-title">{r.title}</h3>}
            <p className="review-body">{r.body}</p>
            {r.pictures.length > 0 && (
              <div className="review-pics">
                {r.pictures.slice(0, 4).map((src) => <img key={src} src={src} alt={`Photo from ${r.name}`} loading="lazy" />)}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div style={{ marginTop: 28 }}><ReviewForm handle={handle} first={reviews.length === 0} /></div>
    </section>
  );
}
