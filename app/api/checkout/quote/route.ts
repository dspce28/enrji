import { body, route, str } from '@/lib/store/api';
import { currentUser } from '@/lib/store/auth';
import { quote } from '@/lib/store/pricing';

/** POST { lines, coupon?, payment? } → the priced order (paise), with any stock problems per line. */
export const POST = route(async (req) => {
  const b = await body<{ lines?: { variantId: number; quantity: number }[]; coupon?: string; payment?: 'cod' | 'online' }>(req);
  const u = await currentUser();
  return quote({ lines: Array.isArray(b.lines) ? b.lines : [], couponCode: str(b.coupon, 40) || null, userId: u?.id ?? null, payment: b.payment === 'cod' ? 'cod' : 'online' });
});
