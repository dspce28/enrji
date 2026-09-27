'use client';

import { useState } from 'react';
import { post, put } from '../store/client';

interface Offer { id: number; name: string; active: boolean; tiers: { qty: number; percent: number }[]; startsAt: string; endsAt: string }

/** Edit the "buy more, save more" tiers. */
export function OfferEditor({ offer }: { offer: Offer | null }) {
  const [f, setF] = useState<Offer>(offer ?? { id: 0, name: 'Buy more, save more', active: true, tiers: [{ qty: 2, percent: 10 }, { qty: 3, percent: 15 }], startsAt: '', endsAt: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const tier = (i: number, k: 'qty' | 'percent', v: string) => setF({ ...f, tiers: f.tiers.map((t, j) => (j === i ? { ...t, [k]: Number(v) } : t)) });
  return (
    <div className="offer">
      <div className="aform-inline">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ minWidth: 220 }} />
        {f.tiers.map((t, i) => (
          <span key={i} className="tier">Buy <input value={t.qty} onChange={(e) => tier(i, 'qty', e.target.value)} inputMode="numeric" style={{ width: 44 }} /> save <input value={t.percent} onChange={(e) => tier(i, 'percent', e.target.value)} inputMode="numeric" style={{ width: 44 }} />%
            <button className="link-btn" onClick={() => setF({ ...f, tiers: f.tiers.filter((_, j) => j !== i) })}>×</button></span>
        ))}
        <button className="link-btn" onClick={() => setF({ ...f, tiers: [...f.tiers, { qty: (f.tiers.at(-1)?.qty ?? 1) + 1, percent: (f.tiers.at(-1)?.percent ?? 5) + 5 }] })}>+ tier</button>
      </div>
      <div className="aform-inline">
        <label>From <input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></label>
        <label>to <input type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
        <button className="btn btn-sm" onClick={async () => {
          setMsg(null);
          try { if (f.id) await put(`/api/admin/offers/${f.id}`, f); else await post('/api/admin/offers', f); setMsg({ ok: true, text: 'Saved.' }); }
          catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
        }}>Save offer</button>
        {msg && <span className={msg.ok ? 'co-note good' : 'form-error'}>{msg.text}</span>}
      </div>
    </div>
  );
}
