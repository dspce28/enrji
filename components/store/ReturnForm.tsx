'use client';

import { useState } from 'react';
import { cdn } from '@/lib/format';
import { post } from './client';

interface Item { id: number; title: string; size: string; color: string | null; image: string | null; left: number; swaps: { id: number; size: string }[] }

export function ReturnForm({ number, items, reasons, exchangeOnly }: { number: string; items: Item[]; reasons: string[]; exchangeOnly: boolean }) {
  const [type, setType] = useState<'exchange' | 'return'>('exchange');
  const [pick, setPick] = useState<Record<number, { q: number; swap?: number }>>({});
  const [reason, setReason] = useState('');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const faulty = /damaged|wrong item/i.test(reason);
  const returnBlocked = exchangeOnly && !faulty;

  return (
    <form className="store-form" style={{ maxWidth: 720 }} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try {
        await post(`/api/orders/${number}/return`, { type, reason, comments, items: Object.entries(pick).map(([id, v]) => ({ orderItemId: Number(id), quantity: v.q, exchangeVariantId: v.swap })) });
        window.location.href = `/account/orders/${number}?return=1`;
      } catch (err) { setError((err as Error).message); setBusy(false); }
    }}>
      <div className="co-pay">
        <label className={`co-option${type === 'exchange' ? ' on' : ''}`}><input type="radio" checked={type === 'exchange'} onChange={() => setType('exchange')} /><div><b>Exchange for another size</b><span>We pick up this one and send the new size, free.</span></div></label>
        <label className={`co-option${type === 'return' ? ' on' : ''}${returnBlocked ? ' disabled' : ''}`}><input type="radio" checked={type === 'return'} disabled={returnBlocked} onChange={() => setType('return')} /><div><b>Return for a refund</b><span>{returnBlocked ? 'Only for damaged or wrong items on this order' : 'Refunded to your original payment method once we receive it.'}</span></div></label>
      </div>
      <div className="return-items">
        {items.map((i) => {
          const v = pick[i.id];
          return (
            <div key={i.id} className={`co-line${v?.q ? '' : ' dim'}`}>
              {i.image ? <img src={cdn(i.image, 160)} alt="" /> : <div className="co-ph" />}
              <div><b>{i.title}</b><span>{[i.color, `Size ${i.size}`].filter(Boolean).join(' · ')}</span>
                {type === 'exchange' && !!v?.q && (i.swaps.length ? (
                  <select value={v.swap ?? ''} onChange={(e) => setPick({ ...pick, [i.id]: { ...v, swap: Number(e.target.value) || undefined } })}>
                    <option value="">New size…</option>{i.swaps.map((s) => <option key={s.id} value={s.id}>{s.size}</option>)}
                  </select>) : <em>No other size in stock right now: choose return instead.</em>)}
              </div>
              <select aria-label="Quantity" value={v?.q ?? 0} onChange={(e) => setPick({ ...pick, [i.id]: { ...v, q: Number(e.target.value) } })}>
                {Array.from({ length: i.left + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? 'Keep' : `Return ${n}`}</option>)}
              </select>
            </div>
          );
        })}
      </div>
      <label className="field"><span>Reason</span><select value={reason} onChange={(e) => { setReason(e.target.value); if (exchangeOnly && !/damaged|wrong item/i.test(e.target.value)) setType('exchange'); }} required><option value="">Choose…</option>{reasons.map((r) => <option key={r}>{r}</option>)}</select></label>
      <label className="field"><span>Anything else? <em>(optional)</em></span><input value={comments} onChange={(e) => setComments(e.target.value)} maxLength={1000} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-gold" disabled={busy || !Object.values(pick).some((v) => v.q > 0) || !reason}>{busy ? 'Sending…' : `Request ${type}`}</button>
    </form>
  );
}
