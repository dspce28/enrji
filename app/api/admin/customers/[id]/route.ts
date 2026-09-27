import { body, route } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';
import { setBlocked } from '@/lib/store/adminMisc';

/** POST { blocked } → hold or restore a customer account (admins only). */
export const POST = route(async (req, { params }) => {
  const u = await requireArea('staff');
  await setBlocked((await params).id, (await body(req)).blocked === true, u.id);
  return { ok: true };
});
