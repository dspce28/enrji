import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { body, requireUser, route, str, StoreError } from '@/lib/store/api';

/** GET /api/account → the signed-in profile (401 when signed out). PUT updates name, email, marketing consent. */
export const GET = route(async () => {
  const u = await requireUser();
  return { user: { name: u.name, email: u.email, phone: u.phone, role: u.role, marketingConsent: u.marketingConsent } };
});

export const PUT = route(async (req) => {
  const u = await requireUser();
  const b = await body(req);
  const name = str(b.name, 80), email = str(b.email, 120).toLowerCase();
  if (name.length < 2) throw new StoreError('Please add your name.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new StoreError('Please add a valid email or leave it empty.');
  await db().update(schema.users).set({ name, email: email || null, marketingConsent: b.marketingConsent === true }).where(eq(schema.users.id, u.id));
  return { ok: true };
});
