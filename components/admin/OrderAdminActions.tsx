'use client';

import { useState } from 'react';
import { post } from '../store/client';

const COURIERS = ['Delhivery', 'Shiprocket', 'Blue Dart', 'DTDC', 'Ecom Express', 'XpressBees', 'India Post', 'Shadowfax'];

/** The next delivery step, shipping details, cancel, refund-done and notes for one order. */
export function OrderAdminActions({ number, next, status, refundDue, tracking }: {
  number: string; next: { action: string; label: string } | null; status: string; refundDue: boolean;
  tracking: { courier: string; awb: string; trackingUrl: string };
}) {
  const [open, setOpen] = useState<null | 'ship' | 'tracking' | 'cancel' | 'refund' | 'note'>(null);
  const [f, setF] = useState({ ...tracking, reason: '', reference: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: string, extra: Record<string, string> = {}) => {
    setBusy(true); setError(null);
    try { await post(`/api/admin/orders/${number}`, { action, ...extra }); window.location.reload(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  const input = (k: keyof typeof f, ph: string, list?: string) => <input value={f[k]} placeholder={ph} list={list} onChange={(e) => setF({ ...f, [k]: e.target.value })} />;
  const shipped = ['shipped', 'out_for_delivery', 'delivered'].includes(status);
  const cancellable = !['cancelled', 'delivered', 'returned'].includes(status);

  return (
    <div className="aactions">
      <div className="aactions-row">
        {next && (next.action === 'ship'
          ? <button className="btn btn-gold btn-sm" onClick={() => setOpen('ship')}>{next.label}…</button>
          : <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => run(next.action)}>{next.label}</button>)}
        {shipped && <button className="btn btn-ghost btn-sm" onClick={() => setOpen('tracking')}>Edit tracking</button>}
        {refundDue && <button className="btn btn-gold btn-sm" onClick={() => setOpen('refund')}>Record refund…</button>}
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen('note')}>Add note</button>
        {cancellable && <button className="btn btn-ghost btn-sm danger" onClick={() => setOpen('cancel')}>Cancel order…</button>}
      </div>
      <datalist id="couriers">{COURIERS.map((c) => <option key={c} value={c} />)}</datalist>
      {(open === 'ship' || open === 'tracking') && (
        <form className="aform-inline" onSubmit={(e) => { e.preventDefault(); void run(open, { courier: f.courier, awb: f.awb, trackingUrl: f.trackingUrl }); }}>
          {input('courier', 'Courier', 'couriers')}{input('awb', 'AWB / tracking number')}{input('trackingUrl', 'Tracking link (optional)')}
          <button className="btn btn-sm" disabled={busy}>{open === 'ship' ? 'Mark shipped' : 'Save'}</button>
          <button type="button" className="link-btn" onClick={() => setOpen(null)}>Close</button>
        </form>
      )}
      {open === 'cancel' && (
        <form className="aform-inline" onSubmit={(e) => { e.preventDefault(); void run('cancel', { reason: f.reason }); }}>
          {input('reason', 'Reason (the customer sees this)')}
          <button className="btn btn-sm danger" disabled={busy}>Cancel order, restock{refundDue ? '' : ' & refund if paid'}</button>
          <button type="button" className="link-btn" onClick={() => setOpen(null)}>Keep order</button>
          {shipped && <p className="fine" style={{ width: '100%', textAlign: 'left' }}>Already shipped: cancel only once the parcel is back with you (RTO), since this puts the stock back.</p>}
        </form>
      )}
      {open === 'refund' && (
        <form className="aform-inline" onSubmit={(e) => { e.preventDefault(); void run('refund_done', { reference: f.reference }); }}>
          {input('reference', 'Refund reference (Razorpay refund id / UTR)')}
          <button className="btn btn-sm" disabled={busy}>Mark refunded</button>
          <button type="button" className="link-btn" onClick={() => setOpen(null)}>Close</button>
        </form>
      )}
      {open === 'note' && (
        <form className="aform-inline" onSubmit={(e) => { e.preventDefault(); void run('note', { note: f.note }); }}>
          {input('note', 'Internal note (only staff see this)')}
          <button className="btn btn-sm" disabled={busy}>Add</button>
          <button type="button" className="link-btn" onClick={() => setOpen(null)}>Close</button>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
