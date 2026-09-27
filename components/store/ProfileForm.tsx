'use client';

import { useState } from 'react';
import { put } from './client';

export function ProfileForm({ user }: { user: { name: string; email: string; phone: string; marketingConsent: boolean } }) {
  const [f, setF] = useState(user);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="store-form" onSubmit={async (e) => {
      e.preventDefault(); setState('saving'); setError(null);
      try { await put('/api/account', f); setState('saved'); setTimeout(() => setState('idle'), 2000); }
      catch (err) { setError((err as Error).message); setState('idle'); }
    }}>
      <label className="field"><span>Name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" required maxLength={80} /></label>
      <label className="field"><span>Email <em>(for order updates and invoices)</em></span><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" maxLength={120} /></label>
      <label className="field"><span>Mobile</span><input value={f.phone.replace('+91', '+91 ')} disabled /></label>
      <label className="check"><input type="checkbox" checked={f.marketingConsent} onChange={(e) => setF({ ...f, marketingConsent: e.target.checked })} /> Send me new drops and offers on WhatsApp</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-gold" disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : 'Save'}</button>
    </form>
  );
}
