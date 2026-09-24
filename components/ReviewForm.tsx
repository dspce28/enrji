'use client';

import { useState } from 'react';

const WORDS = ['', 'Not for me', 'Could be better', 'Good', 'Really good', 'Love it'];

/** "Write a review": sent to Judge.me for the store to approve before it appears. */
export function ReviewForm({ handle, first }: { handle: string; first: boolean }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!rating) return setError('Please choose a star rating.');
    const f = new FormData(e.currentTarget);
    setState('sending'); setError(null);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, rating, ...Object.fromEntries(f) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
      setState('sent');
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  if (state === 'sent') return <p className="review-thanks">Thank you. Your review will appear here once we’ve read it.</p>;
  if (!open) return <button className="btn btn-ghost" onClick={() => setOpen(true)}>{first ? 'Be the first to review' : 'Write a review'}</button>;

  const shown = hover || rating;
  return (
    <form className="review-form" onSubmit={submit} noValidate>
      <fieldset className="review-rate">
        <legend>Your rating</legend>
        <div onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={n <= shown ? 'on' : ''} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n}
              onMouseEnter={() => setHover(n)} onClick={() => setRating(n)}>★</button>
          ))}
          <span className="review-rate-word">{WORDS[shown]}</span>
        </div>
      </fieldset>
      <label><span>Title <em>(optional)</em></span><input name="title" maxLength={100} placeholder="Sum it up" /></label>
      <label><span>Your review</span><textarea name="body" required minLength={10} maxLength={2000} rows={4} placeholder="How does it fit, feel and wash?" /></label>
      <div className="review-form-row">
        <label><span>Name</span><input name="name" required maxLength={60} autoComplete="name" /></label>
        <label><span>Email <em>(not shown)</em></span><input name="email" type="email" required maxLength={120} autoComplete="email" /></label>
      </div>
      <input name="website" tabIndex={-1} autoComplete="off" className="hp" aria-hidden />
      <p className="fine">Use the email you ordered with and your review is marked “verified buyer”. We read every review before it appears.</p>
      {error && <p className="review-error" role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-gold" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Submit review'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
