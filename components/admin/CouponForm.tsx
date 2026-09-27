'use client';

import { useState } from 'react';
import { post, put } from '../store/client';

export interface CouponFields {
  code: string; description: string; type: 'percent' | 'flat' | 'free_shipping'; value: string; minOrder: string; maxDiscount: string;
  appliesTo: 'all' | 'tee' | 'sweatshirt'; startsAt: string; endsAt: string; usageLimit: string; perUserLimit: string;
  firstOrderOnly: boolean; combinable: boolean; active: boolean;
}

export function CouponForm({ id, initial }: { id?: number; initial: CouponFields }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const t = (k: keyof CouponFields, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field"><span>{label}</span><input value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} /></label>
  );
  const c = (k: keyof CouponFields, label: string) => <label className="check"><input type="checkbox" checked={f[k] as boolean} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {label}</label>;
  return (
    <form className="admin-card aeditor" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null);
      try {
        if (id) { await put(`/api/admin/coupons/${id}`, f); setMsg({ ok: true, text: 'Saved.' }); }
        else { const r = await post<{ id: number }>('/api/admin/coupons', f); window.location.href = `/admin/coupons/${r.id}`; }
      } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
      setBusy(false);
    }}>
      <div className="agrid">
        {t('code', 'Code', { style: { textTransform: 'uppercase' }, placeholder: 'DIWALI15' })}
        {t('description', 'Note (shown in admin only)')}
        <label className="field"><span>Discount</span><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as 'percent' })}><option value="percent">% off</option><option value="flat">₹ off</option><option value="free_shipping">Free shipping</option></select></label>
        {f.type !== 'free_shipping' && t('value', f.type === 'percent' ? 'Percent off' : 'Amount off (₹)', { inputMode: 'decimal' })}
        {f.type === 'percent' && t('maxDiscount', 'Maximum discount ₹ (optional)', { inputMode: 'decimal' })}
        {t('minOrder', 'Minimum order ₹ (optional)', { inputMode: 'decimal' })}
        <label className="field"><span>Applies to</span><select value={f.appliesTo} onChange={(e) => setF({ ...f, appliesTo: e.target.value as 'all' })}><option value="all">Everything</option><option value="tee">Tees only</option><option value="sweatshirt">Sweatshirts only</option></select></label>
        {t('startsAt', 'Starts (optional)', { type: 'date' })}
        {t('endsAt', 'Ends (optional)', { type: 'date' })}
        {t('usageLimit', 'Total uses (optional)', { inputMode: 'numeric' })}
        {t('perUserLimit', 'Uses per customer', { inputMode: 'numeric' })}
      </div>
      <div className="aactions-row">{c('firstOrderOnly', 'First order only')}{c('combinable', 'Works together with automatic offers')}{c('active', 'Active')}</div>
      <div className="asave">{msg && <p className={msg.ok ? 'co-note good' : 'form-error'}>{msg.text}</p>}<button className="btn btn-gold" disabled={busy}>{busy ? 'Saving…' : id ? 'Save coupon' : 'Create coupon'}</button></div>
    </form>
  );
}
