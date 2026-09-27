'use client';

import { post } from '../store/client';

export function BlockButton({ id, blocked }: { id: string; blocked: boolean }) {
  return (
    <button className={`btn btn-ghost btn-sm${blocked ? '' : ' danger'}`} onClick={async () => {
      if (!confirm(blocked ? 'Let this customer log in and order again?' : 'Put this account on hold? They’ll be logged out and can’t order.')) return;
      try { await post(`/api/admin/customers/${id}`, { blocked: !blocked }); window.location.reload(); } catch (e) { alert((e as Error).message); }
    }}>{blocked ? 'Restore account' : 'Put account on hold'}</button>
  );
}
