'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Header and footer, left out on the full-screen Lookbook pages, the Trial Room and the admin (they bring their own navigation). */
export function SiteChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const own = path.startsWith('/lookbook') || path.startsWith('/admin') || path === '/trial-room';
  return own ? null : <>{children}</>;
}
