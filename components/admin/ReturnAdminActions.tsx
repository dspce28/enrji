'use client';

import { useState } from 'react';
import { post } from '../store/client';

export function ReturnAdminActions({ id, status, type, suggested, online }: { id: number; status: string; type: 'return' | 'exchange'; suggested: number; online: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<null | 'reject' | 'refund' | 'note'>(null);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState((suggested / 100).toFixed(2));
  const [reference, setReference] = useState('');
  const [restock, setRestock] = useState(true);
  const run = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setError(null);
    try { await post(`/api/admin/returns/${id}`, { action, ...extra }); window.location.reload(); } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <div className="aactions">
      <div className="aactions-row">
        {status === 'requested' && <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => run('approve')}>Approve</button>}
        {status === 'approved' && <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => run('picked_up')}>Mark picked up</button>}
        {(status === 'approved' || status === 'picked_up') && (
          <>
            <label className="check"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Resellable: add back to stock</label>
            <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => run('receive', { restock })}>Mark received</button>
          </>
        )}
        {status === 'received' && type === 'return' && <button className="btn btn-gold btn-sm" onClick={() => setOpen('refund')}>Refund…</button>}
        {status === 'received' && type === 'exchange' && <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => run('exchange')}>Send replacement</button>}
        {(status === 'requested' || status === 'approved') && <button className="btn btn-ghost btn-sm danger" onClick={() => setOpen('reject')}>Reject…</button>}
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen('note')}>Add note</button>
      </div>
      {open === 'refund' && (
        <form className="aform-inline" onSubmit={(e) => { e.preventDefault(); void run('refund', { amount: Number(amount), reference }); }}>
          <label>₹ <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" style={{ width: 110 }} /></label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={online ? 'Leave empty to refund via Razorpay' : 'UPI / bank transfer reference'} />
          <button className="btn btn-sm" disabled={busy}>Refund</button>
          <button type="button" className="link-btn" onClick={() => setOpen(null)}>Close</button>
        </form>
      )}
      {(open === 'reject' || open === 'note') && (
        <form className="aform-inline" onSubmit={(e) => { e.preventDefault(); void run(open, { note }); }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={open === 'reject' ? 'Why (the customer sees this)' : 'Internal note'} />
          <button className="btn btn-sm" disabled={busy}>{open === 'reject' ? 'Reject' : 'Add'}</button>
          <button type="button" className="link-btn" onClick={() => setOpen(null)}>Close</button>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
