'use client';

import { useState } from 'react';
import { AddressForm, AddressText, emptyAddress, type Address } from './AddressForm';
import { del, post, put } from './client';

export function AddressBook({ initial }: { initial: Address[] }) {
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState<Address | 'new' | null>(initial.length ? null : 'new');
  const reload = async () => setList((await (await fetch('/api/account/addresses', { cache: 'no-store' })).json()).addresses);

  if (editing) {
    const isNew = editing === 'new';
    return (
      <AddressForm initial={isNew ? emptyAddress : editing} onCancel={list.length ? () => setEditing(null) : undefined}
        onSubmit={async (a) => {
          if (isNew) await post('/api/account/addresses', a); else await put(`/api/account/addresses/${editing.id}`, a);
          await reload(); setEditing(null);
        }} />
    );
  }
  return (
    <div className="address-list">
      {list.map((a) => (
        <div key={a.id} className="address-card">
          <AddressText a={a} />
          <div className="address-actions">
            {a.isDefault ? <span className="chip chip-gold">Default</span> : (
              <button className="link-btn" onClick={async () => { await put(`/api/account/addresses/${a.id}`, { ...a, isDefault: true }); await reload(); }}>Make default</button>
            )}
            <button className="link-btn" onClick={() => setEditing(a)}>Edit</button>
            <button className="link-btn" onClick={async () => { if (confirm('Delete this address?')) { await del(`/api/account/addresses/${a.id}`); await reload(); } }}>Delete</button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost" onClick={() => setEditing('new')}>+ Add a new address</button>
    </div>
  );
}
