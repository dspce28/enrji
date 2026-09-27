'use client';

import { useEffect, useRef, useState } from 'react';
import { post } from './client';

/** Mobile number → one-time code → signed in. */
export function LoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [testCode, setTestCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await post<{ code?: string }>('/api/auth/otp', { phone });
      setTestCode(r.code ?? null);
      setStep('code'); setCode(''); setWait(30);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError((err as Error).message);
      const retry = (err as { retryIn?: number }).retryIn;
      if (retry) setWait(retry);
    } finally { setBusy(false); }
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length !== 6) return setError('Please enter the 6-digit code.');
    setBusy(true); setError(null);
    try {
      const r = await post<{ user: { isNew: boolean } }>('/api/auth/verify', { phone, code });
      // First visit: ask for a name on the account page; the cart syncs itself on the next page.
      window.location.href = r.user.isNew && next === '/account' ? '/account?welcome=1' : next;
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  if (step === 'phone') {
    return (
      <form className="auth-form" onSubmit={send}>
        <label className="field">
          <span>Mobile number</span>
          <div className="phone-input">
            <span>+91</span>
            <input inputMode="numeric" autoComplete="tel-national" maxLength={11} value={phone} autoFocus
              onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, ''))} placeholder="98765 43210" />
          </div>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-gold btn-block" disabled={busy || phone.replace(/\D/g, '').length < 10 || wait > 0}>
          {busy ? 'Sending…' : wait > 0 ? `Try again in ${wait}s` : 'Send code'}
        </button>
        <p className="fine">By continuing you agree to our terms and privacy policy.</p>
      </form>
    );
  }
  return (
    <form className="auth-form" onSubmit={verify}>
      <p className="muted">Code sent to <b style={{ color: 'var(--text)' }}>+91 {phone}</b> · <button type="button" className="link-btn" onClick={() => { setStep('phone'); setError(null); }}>Change</button></p>
      {testCode && (
        <div className="test-otp" role="status">
          <span>Test mode · your code</span>
          <b>{testCode}</b>
        </div>
      )}
      <label className="field">
        <span>6-digit code</span>
        <input ref={codeRef} className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setCode(v); }} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-gold btn-block" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Verify & continue'}</button>
      <button type="button" className="link-btn" disabled={wait > 0 || busy} onClick={() => send()}>
        {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
      </button>
    </form>
  );
}
