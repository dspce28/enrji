import { body, route, str, StoreError } from '@/lib/store/api';
import { clientIp, normalisePhone, requestOtp } from '@/lib/store/auth';

/** POST /api/auth/otp { phone } → { ok, expiresIn, code? } (code only while it may be shown on screen). */
export const POST = route(async (req) => {
  const phone = normalisePhone(str((await body(req)).phone, 20));
  if (!phone) throw new StoreError('Please enter a valid 10-digit mobile number.');
  const r = await requestOtp(phone, await clientIp());
  return { ok: true, phone, expiresIn: r.expiresIn, code: r.code };
});
