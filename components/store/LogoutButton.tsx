'use client';

import { post } from './client';

export function LogoutButton() {
  return (
    <button className="link-btn account-logout" onClick={async () => {
      await post('/api/auth/logout').catch(() => {});
      try { localStorage.removeItem('enrji.cart.v1'); } catch { /* ignore */ }
      window.location.href = '/';
    }}>Log out</button>
  );
}
