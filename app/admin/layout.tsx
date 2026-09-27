import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ownStore } from '@/lib/db';
import { currentUser } from '@/lib/store/auth';
import { can, type Area } from '@/lib/store/admin';
import { AdminNav } from '@/components/admin/AdminNav';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · ENRJI admin' }, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const AREAS: Area[] = ['dashboard', 'orders', 'returns', 'inventory', 'customers', 'catalogue', 'marketing', 'reports', 'settings', 'staff'];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!ownStore) redirect('/');
  const u = await currentUser();
  if (!u) redirect('/login?next=/admin');
  if (u.role === 'customer') redirect('/account');
  return (
    <div className="admin">
      <AdminNav areas={AREAS.filter((a) => can(u, a))} name={u.name ?? u.phone} role={u.role} />
      <main className="admin-main">{children}</main>
    </div>
  );
}
