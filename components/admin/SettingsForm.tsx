'use client';

import { useState } from 'react';
import { STATES } from '@/lib/states';
import { put } from '../store/client';

type F = {
  shipping: { flat: string; freeAbove: string }; cod: { enabled: boolean; fee: string; maxOrder: string };
  returns: { windowDays: string; exchangeOnly: boolean }; gst: { threshold: string; rateUpTo: string; rateAbove: string };
  store: { name: string; gstin: string; address: string; state: string; email: string; phone: string };
};

export function SettingsForm({ initial }: { initial: F }) {
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const upd = <S extends keyof F>(sec: S, k: keyof F[S], v: string | boolean) => setF({ ...f, [sec]: { ...f[sec], [k]: v } });
  const txt = <S extends keyof F>(sec: S, k: keyof F[S], label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field"><span>{label}</span><input value={f[sec][k] as string} onChange={(e) => upd(sec, k, e.target.value)} {...extra} /></label>
  );
  return (
    <form className="aeditor" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null);
      try { await put('/api/admin/settings', f); setMsg({ ok: true, text: 'Saved. Checkout uses the new settings right away.' }); } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
      setBusy(false);
    }}>
      <section className="admin-card"><h2>Shipping</h2><div className="agrid">
        {txt('shipping', 'flat', 'Shipping fee ₹ (0 = free)', { inputMode: 'decimal' })}
        {txt('shipping', 'freeAbove', 'Free shipping from ₹ (0 = always free)', { inputMode: 'decimal' })}
      </div></section>
      <section className="admin-card"><h2>Cash on delivery</h2><div className="agrid">
        <label className="check"><input type="checkbox" checked={f.cod.enabled} onChange={(e) => upd('cod', 'enabled', e.target.checked)} /> Offer cash on delivery</label>
        {txt('cod', 'fee', 'COD fee ₹', { inputMode: 'decimal' })}
        {txt('cod', 'maxOrder', 'COD only up to ₹', { inputMode: 'decimal' })}
      </div></section>
      <section className="admin-card"><h2>Returns</h2><div className="agrid">
        {txt('returns', 'windowDays', 'Days after delivery to ask (0 = no returns)', { inputMode: 'numeric' })}
        <label className="check"><input type="checkbox" checked={f.returns.exchangeOnly} onChange={(e) => upd('returns', 'exchangeOnly', e.target.checked)} /> Size exchange only (refunds just for damaged / wrong items)</label>
      </div></section>
      <section className="admin-card"><h2>GST</h2><div className="agrid">
        {txt('gst', 'rateUpTo', 'Rate up to the threshold %', { inputMode: 'numeric' })}
        {txt('gst', 'threshold', 'Threshold per piece ₹', { inputMode: 'decimal' })}
        {txt('gst', 'rateAbove', 'Rate above it %', { inputMode: 'numeric' })}
      </div><p className="fine" style={{ textAlign: 'left' }}>Apparel from 22 Sept 2025: 5% up to ₹2,500 a piece, 18% above. Confirm with your accountant.</p></section>
      <section className="admin-card"><h2>Business details <em className="muted">(invoices and packing slips)</em></h2><div className="agrid">
        {txt('store', 'name', 'Business name')}
        {txt('store', 'gstin', 'GSTIN', { style: { textTransform: 'uppercase' } })}
        <label className="field"><span>State (for CGST/SGST vs IGST)</span><select value={f.store.state} onChange={(e) => upd('store', 'state', e.target.value)}><option value="">Choose…</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
        {txt('store', 'email', 'Support email')}
        {txt('store', 'phone', 'Support phone')}
        <label className="field wide"><span>Registered address</span><input value={f.store.address} onChange={(e) => upd('store', 'address', e.target.value)} /></label>
      </div></section>
      <div className="asave">{msg && <p className={msg.ok ? 'co-note good' : 'form-error'}>{msg.text}</p>}<button className="btn btn-gold" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  );
}
