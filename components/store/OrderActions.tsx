'use client';

import { useEffect, useState } from 'react';
import { useCart } from '../cart';
import { post } from './client';
import { openRazorpay, type PayStart } from './pay';

/** Pay now / cancel on an order page; also clears bought items from this device's bag after checkout. */
export function OrderActions({ number, canPay, canCancel, clearVariants }: { number: string; canPay: boolean; canCancel: boolean; clearVariants: number[] }) {
  const { remove } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After the bag has loaded from this device (its own effect runs after ours), take out what was bought.
  useEffect(() => {
    if (!clearVariants.length) return;
    const t = setTimeout(() => clearVariants.forEach((id) => remove(id)), 0);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canPay && !canCancel) return null;
  const reload = () => { window.location.href = `/account/orders/${number}`; };
  return (
    <div className="order-actions">
      {canPay && (
        <button className="btn btn-gold" disabled={busy} onClick={async () => {
          setBusy(true); setError(null);
          try {
            const p = await post<PayStart>('/api/checkout/pay', { number });
            if (p.mode === 'test') { window.location.href = `/checkout/pay/${number}`; return; }
            await openRazorpay(p, { onPaid: () => { window.location.href = `/account/orders/${number}?placed=1`; }, onDismiss: () => setBusy(false) });
          } catch (e) { setError((e as Error).message); setBusy(false); }
        }}>Pay now</button>
      )}
      {canCancel && (
        <button className="btn btn-ghost" disabled={busy} onClick={async () => {
          const reason = prompt('Cancel this order? Tell us why (optional):', '');
          if (reason === null) return;
          setBusy(true); setError(null);
          try { await post(`/api/orders/${number}/cancel`, { reason }); reload(); } catch (e) { setError((e as Error).message); setBusy(false); }
        }}>Cancel order</button>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
