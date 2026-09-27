import 'server-only';
import { redirect } from 'next/navigation';
import { db, ownStore, schema } from '../db';
import { currentUser } from './auth';
import { StoreError } from './api';

/**
 * Who may do what in the admin.
 *  staff: dashboard, orders & deliveries, returns, stock, customers (view)
 *  admin: everything, including products & prices, coupons & offers, reports, settings and staff
 */
export type Area = 'dashboard' | 'orders' | 'returns' | 'inventory' | 'customers' | 'catalogue' | 'marketing' | 'reports' | 'settings' | 'staff';
const STAFF_AREAS: Area[] = ['dashboard', 'orders', 'returns', 'inventory', 'customers'];

type User = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
export const can = (u: User | null, area: Area) => !!u && (u.role === 'admin' || (u.role === 'staff' && STAFF_AREAS.includes(area)));

/** For admin pages: the staff member, or off to log in / a "not allowed" page. */
export async function needStaff(area: Area, path = '/admin') {
  if (!ownStore) redirect('/');
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!can(u, area)) redirect(u.role === 'customer' ? '/account' : '/admin?denied=1');
  return u;
}

/** For admin API routes. */
export async function requireArea(area: Area) {
  const u = await currentUser();
  if (!u) throw new StoreError('Please log in.', 401);
  if (!can(u, area)) throw new StoreError('You don’t have access to this.', 403);
  return u;
}

/** Record an admin change: who did what to which record. */
export async function audit(userId: string, action: string, entity: string, entityId: string | number | null, data?: unknown) {
  await db().insert(schema.auditLog).values({ userId, action, entity, entityId: entityId == null ? null : String(entityId), data: data as object });
}
