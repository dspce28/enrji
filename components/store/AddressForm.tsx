'use client';

import { useState } from 'react';
import { STATES } from '@/lib/states';

export interface Address {
  id?: string; label?: string | null; name: string; phone: string; line1: string; line2?: string | null;
  landmark?: string | null; city: string; state: string; pincode: string; isDefault?: boolean;
}
export const emptyAddress: Address = { name: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', label: '', isDefault: false };

/** Add / edit a delivery address. The server validates everything again. */
export function AddressForm({ initial, onSubmit, onCancel, submitLabel = 'Save address' }: {
  initial: Address; onSubmit(a: Address): Promise<void>; onCancel?(): void; submitLabel?: string;
}) {
  const [a, setA] = useState<Address>({ ...initial, phone: initial.phone.replace(/^\+91/, '') });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = (k: keyof Address) => ({ value: (a[k] as string) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setA({ ...a, [k]: e.target.value }) });

  return (
    <form className="store-form address-form" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { await onSubmit(a); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
    }}>
      <div className="form-row">
        <label className="field"><span>Full name</span><input {...f('name')} autoComplete="name" required maxLength={80} /></label>
        <label className="field"><span>Mobile for delivery</span><input {...f('phone')} inputMode="numeric" autoComplete="tel-national" required maxLength={11} /></label>
      </div>
      <label className="field"><span>House / flat, building, street</span><input {...f('line1')} autoComplete="address-line1" required maxLength={150} /></label>
      <div className="form-row">
        <label className="field"><span>Area, locality <em>(optional)</em></span><input {...f('line2')} autoComplete="address-line2" maxLength={150} /></label>
        <label className="field"><span>Landmark <em>(optional)</em></span><input {...f('landmark')} maxLength={100} /></label>
      </div>
      <div className="form-row form-row-3">
        <label className="field"><span>Pincode</span><input {...f('pincode')} inputMode="numeric" autoComplete="postal-code" required maxLength={6} /></label>
        <label className="field"><span>City</span><input {...f('city')} autoComplete="address-level2" required maxLength={60} /></label>
        <label className="field"><span>State</span>
          <select {...f('state')} required autoComplete="address-level1">
            <option value="">Choose…</option>
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label className="field"><span>Label <em>(optional)</em></span><input {...f('label')} placeholder="Home, Work…" maxLength={30} /></label>
        <label className="check" style={{ alignSelf: 'end', paddingBottom: 12 }}><input type="checkbox" checked={!!a.isDefault} onChange={(e) => setA({ ...a, isDefault: e.target.checked })} /> Make this my default address</label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-gold" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export function AddressText({ a }: { a: Address }) {
  return (
    <div className="address-text">
      <b>{a.name}</b>{a.label && <span className="chip">{a.label}</span>}
      <div>{[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')}</div>
      <div>{a.city}, {a.state} {a.pincode}</div>
      <div className="muted">{a.phone.replace(/^\+91/, '+91 ')}</div>
    </div>
  );
}
