import { body, route, str } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';
import { setRole } from '@/lib/store/adminMisc';

/** POST { phone, role: customer | staff | admin, name } → give or remove admin access. */
export const POST = route(async (req) => {
  const u = await requireArea('staff');
  const b = await body(req);
  const role = (['customer', 'staff', 'admin'].includes(String(b.role)) ? b.role : 'staff') as 'staff';
  await setRole(str(b.phone, 20), role, str(b.name, 80), u.id);
  return { ok: true };
});
