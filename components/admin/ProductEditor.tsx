'use client';

import { useState } from 'react';
import { post, put } from '../store/client';

interface V { id?: number; size: string; color: string; sku: string; price: string; compareAt: string; active: boolean; stock: number; openingStock?: string }
export interface ProductForm {
  title: string; handle: string; kind: 'tee' | 'sweatshirt'; status: 'active' | 'draft' | 'archived'; limited: boolean; tags: string;
  story: string; details: string; care: string; hsn: string; seoTitle: string; seoDescription: string;
  images: { src: string; alt: string }[]; variants: V[];
}

export function ProductEditor({ id, initial, uploads }: { id?: number; initial: ProductForm; uploads: boolean }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newImg, setNewImg] = useState('');
  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => setF({ ...f, [k]: v });
  const setV = (i: number, patch: Partial<V>) => set('variants', f.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const moveImg = (i: number, d: number) => { const a = [...f.images]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); set('images', a); };

  async function upload(file: File) {
    const fd = new FormData(); fd.append('file', file);
    setMsg(null);
    const res = await fetch('/api/admin/uploads', { method: 'POST', body: fd });
    const j = await res.json();
    if (!res.ok) return setMsg({ ok: false, text: j.error });
    set('images', [...f.images, { src: j.url, alt: f.title }]);
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const payload = { ...f, variants: f.variants.map((v) => ({ ...v, openingStock: v.id ? undefined : v.openingStock })) };
      const r = id ? await put<{ id: number }>(`/api/admin/products/${id}`, payload) : await post<{ id: number }>('/api/admin/products', payload);
      if (!id) { window.location.href = `/admin/products/${r.id}?created=1`; return; }
      setMsg({ ok: true, text: 'Saved. The store shows the changes right away.' });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }

  return (
    <div className="aeditor">
      <section className="admin-card">
        <h2>Basics</h2>
        <div className="agrid">
          <label className="field wide"><span>Name</span><input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Believe Sweatshirt" /></label>
          <label className="field"><span>Web address</span><input value={f.handle} onChange={(e) => set('handle', e.target.value)} placeholder="made from the name" /></label>
          <label className="field"><span>Type</span><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'tee', hsn: e.target.value === 'sweatshirt' ? '6110' : '6109' })}><option value="tee">Tee</option><option value="sweatshirt">Sweatshirt</option></select></label>
          <label className="field"><span>Status</span><select value={f.status} onChange={(e) => set('status', e.target.value as 'active')}><option value="active">Active (on sale)</option><option value="draft">Draft (hidden)</option><option value="archived">Archived</option></select></label>
          <label className="field"><span>HSN code</span><input value={f.hsn} onChange={(e) => set('hsn', e.target.value)} /></label>
          <label className="field wide"><span>Tags <em>(comma separated)</em></span><input value={f.tags} onChange={(e) => set('tags', e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={f.limited} onChange={(e) => set('limited', e.target.checked)} /> Limited edition</label>
        </div>
      </section>

      <section className="admin-card">
        <h2>Sizes, prices & SKUs</h2>
        <table className="atable edit">
          <thead><tr><th>Size</th><th>Colour</th><th>SKU</th><th>Price ₹</th><th>MRP ₹</th><th>{id ? 'Stock' : 'Opening stock'}</th><th>On sale</th><th /></tr></thead>
          <tbody>
            {f.variants.map((v, i) => (
              <tr key={i} className={v.active ? '' : 'dim'}>
                <td><input value={v.size} onChange={(e) => setV(i, { size: e.target.value })} style={{ width: 60 }} /></td>
                <td><input value={v.color} onChange={(e) => setV(i, { color: e.target.value })} placeholder="—" style={{ width: 90 }} /></td>
                <td><input value={v.sku} onChange={(e) => setV(i, { sku: e.target.value })} style={{ width: 230 }} /></td>
                <td><input value={v.price} onChange={(e) => setV(i, { price: e.target.value })} inputMode="decimal" style={{ width: 80 }} /></td>
                <td><input value={v.compareAt} onChange={(e) => setV(i, { compareAt: e.target.value })} inputMode="decimal" placeholder="—" style={{ width: 80 }} /></td>
                <td>{v.id ? <a href={`/admin/inventory?q=${encodeURIComponent(v.sku || f.title)}`}>{v.stock}</a> : <input value={v.openingStock ?? '0'} onChange={(e) => setV(i, { openingStock: e.target.value })} inputMode="numeric" style={{ width: 60 }} />}</td>
                <td><input type="checkbox" checked={v.active} onChange={(e) => setV(i, { active: e.target.checked })} /></td>
                <td>{!v.id && <button className="link-btn" onClick={() => set('variants', f.variants.filter((_, j) => j !== i))}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="aactions-row" style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => set('variants', [...f.variants, { size: '', color: f.variants.at(-1)?.color ?? '', sku: '', price: f.variants.at(-1)?.price ?? '', compareAt: f.variants.at(-1)?.compareAt ?? '', active: true, stock: 0, openingStock: '0' }])}>+ Add size</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { const p = prompt('Set every selling price to (₹):'); if (p) set('variants', f.variants.map((v) => ({ ...v, price: p }))); }}>Set all prices…</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { const p = prompt('Set every MRP to (₹, empty for none):', ''); if (p !== null) set('variants', f.variants.map((v) => ({ ...v, compareAt: p }))); }}>Set all MRPs…</button>
        </div>
        <p className="fine" style={{ textAlign: 'left' }}>Stock is changed on the Inventory page, so every change is logged. Sizes that have been ordered can&apos;t be deleted; untick “On sale” to hide them.</p>
      </section>

      <section className="admin-card">
        <h2>Photos</h2>
        <div className="aimages">
          {f.images.map((im, i) => (
            <figure key={im.src + i}>
              <img src={im.src} alt="" />
              <figcaption>
                {i > 0 && <button className="link-btn" onClick={() => moveImg(i, -1)}>←</button>}
                {i < f.images.length - 1 && <button className="link-btn" onClick={() => moveImg(i, 1)}>→</button>}
                <button className="link-btn" onClick={() => set('images', f.images.filter((_, j) => j !== i))}>Remove</button>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="aform-inline">
          <input value={newImg} onChange={(e) => setNewImg(e.target.value)} placeholder="Paste an image link (https://…)" />
          <button className="btn btn-sm" onClick={() => { if (newImg.trim()) { set('images', [...f.images, { src: newImg.trim(), alt: f.title }]); setNewImg(''); } }}>Add</button>
          {uploads && <label className="btn btn-ghost btn-sm">Upload…<input type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }} /></label>}
        </div>
        <p className="fine" style={{ textAlign: 'left' }}>The first photo is the main one on cards and share links.{!uploads && ' Add Blob storage on Vercel to upload photos directly.'}</p>
      </section>

      <section className="admin-card">
        <h2>Description</h2>
        <label className="field"><span>Story <em>(blank line between paragraphs)</em></span><textarea rows={6} value={f.story} onChange={(e) => set('story', e.target.value)} /></label>
        <label className="field"><span>Details <em>(one per line)</em></span><textarea rows={5} value={f.details} onChange={(e) => set('details', e.target.value)} /></label>
        <label className="field"><span>Care</span><input value={f.care} onChange={(e) => set('care', e.target.value)} /></label>
        <label className="field"><span>Search title <em>(optional, 70 characters)</em></span><input value={f.seoTitle} maxLength={70} onChange={(e) => set('seoTitle', e.target.value)} /></label>
        <label className="field"><span>Search description <em>(optional, 170 characters)</em></span><input value={f.seoDescription} maxLength={170} onChange={(e) => set('seoDescription', e.target.value)} /></label>
      </section>

      <div className="asave">
        {msg && <p className={msg.ok ? 'co-note good' : 'form-error'} role="status">{msg.text}</p>}
        <button className="btn btn-gold" disabled={busy} onClick={save}>{busy ? 'Saving…' : id ? 'Save changes' : 'Create product'}</button>
      </div>
    </div>
  );
}
