'use client';

import { useState } from 'react';
import { post } from './client';

export function TestGateway({ number, clear }: { number: string; clear: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const go = async (outcome: 'success' | 'failure') => {
    setBusy(true); setMsg(null);
    try {
      const r = await post<{ ok: boolean; message?: string }>('/api/checkout/test-pay', { number, outcome });
      if (r.ok) window.location.href = `/account/orders/${number}?placed=1${clear ? '&clear=1' : ''}`;
      else { setMsg(r.message ?? 'Payment failed.'); setBusy(false); }
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  };
  return (
    <div className="auth-form">
      <button className="btn btn-gold btn-block" disabled={busy} onClick={() => go('success')}>Simulate successful payment</button>
      <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => go('failure')}>Simulate failed payment</button>
      {msg && <p className="form-error" role="alert">{msg}</p>}
      <a className="link-btn" href={`/account/orders/${number}`}>Pay later (the order is held for 30 minutes)</a>
    </div>
  );
}
