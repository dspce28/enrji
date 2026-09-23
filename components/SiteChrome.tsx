'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Header, announcement bar and footer, left out on the full-screen Lookbook pages (they bring their own navigation). */
export function SiteChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  return path.startsWith('/lookbook') ? null : <>{children}</>;
}
