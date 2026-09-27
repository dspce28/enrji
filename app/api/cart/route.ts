import { body, requireUser, route } from '@/lib/store/api';
import { replaceCart, savedCart } from '@/lib/store/account';

/** The signed-in shopper's cart, kept on the account so it follows them across devices. */
export const GET = route(async () => ({ lines: await savedCart((await requireUser()).id) }));
export const PUT = route(async (req) => {
  const u = await requireUser();
  const { lines } = await body<{ lines?: { variantId: number; quantity: number }[] }>(req);
  await replaceCart(u.id, Array.isArray(lines) ? lines : []);
  return { lines: await savedCart(u.id) };
});
