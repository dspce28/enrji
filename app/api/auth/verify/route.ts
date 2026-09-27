import { body, route, str, StoreError } from '@/lib/store/api';
import { normalisePhone, verifyOtp } from '@/lib/store/auth';

/** POST /api/auth/verify { phone, code } → signs in; { ok, user }. */
export const POST = route(async (req) => {
  const b = await body(req);
  const phone = normalisePhone(str(b.phone, 20));
  const code = str(b.code, 10);
  if (!phone || !/^\d{6}$/.test(code)) throw new StoreError('Please enter the 6-digit code.');
  const u = await verifyOtp(phone, code, req.headers.get('user-agent'));
  return { ok: true, user: { name: u.name, phone: u.phone, role: u.role, isNew: !u.name } };
});
