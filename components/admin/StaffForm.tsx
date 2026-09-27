'use client';

import { useState } from 'react';
import { post } from '../store/client';

export function StaffForm() {
  const [f, setF] = useState({ phone: '', name: '', role: 'staff' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="aform-inline" style={{ marginTop: 16 }} onSubmit={async (e) => {
      e.preventDefault(); setMsg(null);
      try { await post('/api/admin/staff', f); window.location.reload(); } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
    }}>
      <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Mobile number" inputMode="numeric" />
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name" />
      <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="staff">Staff</option><option value="admin">Admin</option><option value="customer">Remove access</option></select>
      <button className="btn btn-sm">Save</button>
      {msg && <span className="form-error">{msg.text}</span>}
    </form>
  );
}
