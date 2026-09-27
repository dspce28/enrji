'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Area } from '@/lib/store/admin';

const LINKS: { area: Area; href: string; label: string }[] = [
  { area: 'dashboard', href: '/admin', label: 'Dashboard' },
  { area: 'orders', href: '/admin/orders', label: 'Orders' },
  { area: 'returns', href: '/admin/returns', label: 'Returns' },
  { area: 'catalogue', href: '/admin/products', label: 'Products' },
  { area: 'inventory', href: '/admin/inventory', label: 'Inventory' },
  { area: 'marketing', href: '/admin/coupons', label: 'Coupons & offers' },
  { area: 'customers', href: '/admin/customers', label: 'Customers' },
  { area: 'reports', href: '/admin/reports', label: 'Reports' },
  { area: 'settings', href: '/admin/settings', label: 'Settings' },
  { area: 'staff', href: '/admin/staff', label: 'Staff & log' },
];

export function AdminNav({ areas, name, role }: { areas: Area[]; name: string; role: string }) {
  const path = usePathname();
  const active = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href));
  return (
    <aside className="admin-nav">
      <Link href="/admin" className="admin-brand">ENRJI <span>admin</span></Link>
      <nav>
        {LINKS.filter((l) => areas.includes(l.area)).map((l) => (
          <Link key={l.href} href={l.href} aria-current={active(l.href) ? 'page' : undefined}>{l.label}</Link>
        ))}
      </nav>
      <div className="admin-me">
        <b>{name}</b><span>{role}</span>
        <Link href="/">View store ↗</Link>
      </div>
    </aside>
  );
}
