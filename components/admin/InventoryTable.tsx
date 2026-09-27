'use client';

import Link from 'next/link';
import { useState } from 'react';
import { post } from '../store/client';

interface Row { id: number; title: string; productId: number; status: string; size: string; color: string | null; sku: string | null; stock: number }
const REASONS = [['restock', 'New stock arrived'], ['count', 'Stock count correction'], ['damaged', 'Damaged / lost'], ['adjust', 'Other adjustment']];

export function InventoryTable({ rows: initial }: { rows: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [edit, setEdit] = useState<Record<number, { value: string; reason: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function save(r: Row) {
    const e = edit[r.id];
    if (!e) return;
    const v = e.value.trim();
    const mode = /^[+-]/.test(v) ? 'add' : 'set';
    try {
      const res = await post<{ stock: number }>('/api/admin/inventory', { variantId: r.id, mode, value: Number(v), reason: e.reason, note: '' });
      setRows(rows.map((x) => (x.id === r.id ? { ...x, stock: res.stock } : x)));
      setEdit(({ [r.id]: _, ...rest }) => rest);
      setMsg(null);
    } catch (err) { setMsg(`${r.title} ${r.size}: ${(err as Error).message}`); }
  }

  async function importFile(file: File) {
    setImporting(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/inventory/import', { method: 'POST', body: await file.text() });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setMsg(`Updated ${j.changed} size(s).${j.unknown.length ? ` Unknown SKUs: ${j.unknown.slice(0, 5).join(', ')}${j.unknown.length > 5 ? '…' : ''}.` : ''}${j.bad.length ? ` Bad numbers for: ${j.bad.slice(0, 5).join(', ')}.` : ''}`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) { setMsg((e as Error).message); }
    setImporting(false);
  }

  return (
    <>
      <div className="aform-inline" style={{ marginBottom: 14 }}>
        <label className="btn btn-ghost btn-sm">{importing ? 'Importing…' : 'Import stock file…'}<input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} /></label>
        <span className="muted" style={{ fontSize: 13 }}>Type a number to set the count, or +5 / −2 to add or remove.</span>
      </div>
      {msg && <p className="banner warn">{msg}</p>}
      <table className="atable">
        <thead><tr><th>Product</th><th>Colour / size</th><th>SKU</th><th className="num">In stock</th><th>Change</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => {
            const e = edit[r.id];
            return (
              <tr key={r.id} className={r.status !== 'active' ? 'dim' : ''}>
                <td><Link href={`/admin/products/${r.productId}`}>{r.title}</Link>{r.status !== 'active' && <span className="muted"> · {r.status}</span>}</td>
                <td>{[r.color, r.size].filter(Boolean).join(' / ')}</td>
                <td className="muted">{r.sku}</td>
                <td className={`num ${r.stock === 0 ? 'neg' : r.stock <= 3 ? 'warn' : ''}`}><Link href={`/admin/inventory/${r.id}`} title="History">{r.stock}</Link></td>
                <td>
                  <input className="stock-in" value={e?.value ?? ''} placeholder="—" inputMode="numeric"
                    onChange={(ev) => setEdit({ ...edit, [r.id]: { value: ev.target.value.replace(/[^\d+-]/g, ''), reason: e?.reason ?? 'restock' } })}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') void save(r); }} />
                  {e && <select value={e.reason} onChange={(ev) => setEdit({ ...edit, [r.id]: { ...e, reason: ev.target.value } })}>{REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
                </td>
                <td>{e && e.value && <button className="btn btn-sm" onClick={() => save(r)}>Save</button>}</td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={6} className="muted">Nothing matches.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
