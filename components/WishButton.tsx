'use client';

import { useCart } from './cart';

/** Heart toggle for the wishlist (ENRJI's own store only; signed-out shoppers are sent to log in). */
export function WishButton({ productId, className = '', label = false }: { productId: number; className?: string; label?: boolean }) {
  const { ownStore, wish, toggleWish } = useCart();
  if (!ownStore) return null;
  const on = wish.has(productId);
  return (
    <button type="button" className={`wish-btn${on ? ' on' : ''} ${className}`} aria-pressed={on} aria-label={on ? 'Remove from wishlist' : 'Save to wishlist'}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggleWish(productId); }}>
      <svg viewBox="0 0 24 24" aria-hidden><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
      {label && <span>{on ? 'Saved' : 'Wishlist'}</span>}
    </button>
  );
}
